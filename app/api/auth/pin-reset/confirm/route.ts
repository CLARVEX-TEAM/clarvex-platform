import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { consumeResetToken } from "@/lib/pin-reset";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  token: z.string().trim().min(20).max(200),
  // Mismo formato que el login (app/api/auth/employee-login): si aquí se
  // aceptara otra cosa, se podría fijar un PIN con el que luego no se entra.
  pin: z.string().regex(/^\d{4,6}$/, "El PIN debe tener de 4 a 6 dígitos.")
});

/**
 * Canjea el enlace por un PIN nuevo.
 *
 * Aquí SÍ se distingue el motivo del fallo (caducado / ya usado / inválido), al
 * revés que en `request`. No filtra nada: para llegar hasta aquí hay que tener
 * ya un token de 32 bytes aleatorios en la mano, así que decir "este enlace ya
 * caducó" no le revela a nadie información que no tuviera. Y callárselo dejaría
 * a la persona sin saber que solo necesita pedir otro enlace.
 */
export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const parsed = await parseJson(request, inputSchema);
  if ("response" in parsed) return parsed.response;

  const rateLimit = await rateLimitAuth(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo en un momento." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const result = await consumeResetToken(parsed.data.token, parsed.data.pin);

  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "Este enlace ya caducó. Pide uno nuevo."
        : result.reason === "used"
          ? "Este enlace ya se usó. Pide uno nuevo."
          : "Este enlace no es válido. Pide uno nuevo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Sin sesión automática a propósito: que entre con el PIN nuevo confirma que
  // quedó como esperaba, y no deja una sesión abierta si el enlace acabó en
  // manos ajenas.
  return NextResponse.json({ message: "Tu PIN quedó actualizado. Ya puedes iniciar sesión." });
}
