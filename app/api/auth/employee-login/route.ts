import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth, rateLimitInspect } from "@/lib/rate-limit";
import { hashPin, publicUser, verifyPin } from "@/lib/security";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("inspect"), employeeNumber: z.string().trim().min(1).max(30) }),
  z.object({ action: z.literal("login"), employeeNumber: z.string().trim().min(1).max(30), pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 digitos.") }),
  z.object({ action: z.literal("setup"), employeeNumber: z.string().trim().min(1).max(30), pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 digitos.") })
]);

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const isInspect = parsed.data.action === "inspect";
  const rateLimit = isInspect ? rateLimitInspect(ip) : rateLimitAuth(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo en un momento." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { employeeNumber: parsed.data.employeeNumber } });

  if (isInspect) {
    if (!user) return NextResponse.json({ error: "Numero de empleado no encontrado." }, { status: 404 });
    return NextResponse.json({ user: publicUser(user), requiresPinSetup: !user.pinHash });
  }

  // Unified error for "not found" and "wrong PIN" to prevent user enumeration via login
  if (!user) {
    return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
  }

  if (parsed.data.action === "setup") {
    if (user.pinHash) return NextResponse.json({ error: "Este usuario ya tiene un PIN configurado." }, { status: 409 });
    user.pinHash = await hashPin(parsed.data.pin);
  } else {
    if (!user.pinHash) return NextResponse.json({ error: "Debes crear tu PIN antes de iniciar sesion." }, { status: 409 });
    if (!(await verifyPin(parsed.data.pin, user.pinHash))) {
      return NextResponse.json({ error: "Credenciales invalidas." }, { status: 401 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { pinHash: user.pinHash, lastLoginAt: new Date() }
  });
  const token = await createSessionToken(updated);
  const response = NextResponse.json({ user: publicUser(updated) });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}
