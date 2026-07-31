import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimitAuth } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { appUrl, emailEnabled, hasRealEmail, sendEmail } from "@/lib/email";
import { pinResetEmail } from "@/lib/email-templates";
import { countRecentRequests, issueResetToken, purgeExpiredTokens, tooManyRecentRequests, TOKEN_TTL_MS } from "@/lib/pin-reset";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(30)
});

/**
 * RESPUESTA ÚNICA, PASE LO QUE PASE.
 *
 * Este endpoint es público y recibe números de empleado. Si contestara distinto
 * cuando la cuenta existe ("te mandamos el correo") y cuando no ("no existe"),
 * sería un buscador de números válidos: se teclean números hasta que cambie el
 * mensaje. Por eso todos los caminos —cuenta inexistente, desactivada, sin
 * correo real, correo que rebotó— devuelven ESTO y con el mismo código.
 *
 * El precio es real: alguien con un correo inventado pedirá el enlace, no le
 * llegará nada y el mensaje le dirá que revise su bandeja. Es el mal menor
 * frente a filtrar qué números existen, y por eso el texto habla de "si el
 * número existe y tiene correo registrado" en vez de prometer un envío.
 */
const GENERIC_RESPONSE = {
  message: "Si el número existe y tiene un correo registrado, te llegará un enlace en unos minutos."
};

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

  // Limpieza oportunista de tokens viejos, como hace lib/rate-limit. Evita un
  // cron dedicado para una tabla que crece muy despacio.
  if (Math.random() < 0.05) void purgeExpiredTokens();

  // A partir de aquí NADA cambia la respuesta. Cada `return` es el mismo objeto.
  try {
    if (!emailEnabled()) {
      console.error("[pin-reset] Solicitud recibida pero el correo no está configurado (RESEND_API_KEY / RESEND_FROM).");
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const user = await prisma.user.findUnique({
      where: { employeeNumber: parsed.data.employeeNumber },
      select: { id: true, name: true, email: true, active: true }
    });

    if (!user || !user.active || !hasRealEmail(user.email)) return NextResponse.json(GENERIC_RESPONSE);

    // Tope por cuenta: que nadie use esto para bombardear el buzón de alguien.
    const recent = await countRecentRequests(user.id);
    if (tooManyRecentRequests(recent)) {
      console.warn(`[pin-reset] Tope de solicitudes alcanzado para el usuario ${user.id}.`);
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const token = await issueResetToken(user.id, ip || null);
    const url = `${appUrl()}/recuperar/${encodeURIComponent(token)}`;
    const { subject, html, text } = pinResetEmail({
      name: user.name,
      url,
      minutes: Math.round(TOKEN_TTL_MS / 60000)
    });

    const sent = await sendEmail({ to: user.email, subject, html, text });
    if (!sent.ok) {
      // Se registra para poder diagnosticar (dominio sin verificar en Resend,
      // destinatario rebotado...). Al usuario no se le dice: revelaría que el
      // número existe y tiene correo.
      console.error(`[pin-reset] No se pudo enviar a ${user.id}: ${sent.error}`);
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    // Ni siquiera un fallo interno puede cambiar la respuesta.
    console.error("[pin-reset] Error inesperado:", error);
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
