import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { DEMO_ADVISOR_EMPLOYEE, DEMO_MANAGER_EMPLOYEE, DEMO_STORE_ID } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Redirección RELATIVA (Location: "/ruta"). El navegador la resuelve contra el
 * dominio público (app.adrianluna.mx), no contra la URL interna del proxy
 * (localhost:3000) — que es lo que devuelve request.url detrás de Nginx.
 */
function redirectTo(path: string, token?: string) {
  const response = new NextResponse(null, { status: 303, headers: { Location: path } });
  if (token) response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}

/**
 * GET /api/demo/manager  |  /api/demo/advisor
 *
 * Entrada sin fricción al MODO DEMO: crea una sesión del usuario demo
 * correspondiente (sin PIN) y redirige a su dashboard. La sesión es de SOLO
 * LECTURA — el middleware corta cualquier POST/PATCH/DELETE de sesiones demo.
 * Es pública (allowlist en middleware) y con rate-limit.
 */
export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const employeeNumber = role === "manager"
    ? DEMO_MANAGER_EMPLOYEE
    : role === "advisor"
      ? DEMO_ADVISOR_EMPLOYEE
      : null;
  if (!employeeNumber) return redirectTo("/login");

  const rate = await rateLimitAuth(clientIp(request.headers));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta en un momento." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const user = await prisma.user.findFirst({
    where: { employeeNumber, storeId: DEMO_STORE_ID, isDemo: true, active: true }
  });
  // Si aún no se ha sembrado la tienda demo, no reventamos: al login con aviso.
  if (!user) return redirectTo("/login?demo=unavailable");

  const token = await createSessionToken(user);
  return redirectTo(user.role === "ASESOR" ? "/advisor" : "/manager", token);
}
