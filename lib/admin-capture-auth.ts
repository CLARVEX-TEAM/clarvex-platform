import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Autoriza la CAPTURA de datos operativos desde el panel externo (Retool).
 *
 * Tiene un secreto propio y NO reutiliza `ADMIN_SYNC_SECRET`. Ese solo permite
 * disparar la sincronización de una fuente ya configurada: si se filtra, lo
 * peor que consigue alguien es releer un Excel. Este, en cambio, escribe
 * horarios, y más adelante ventas y asistencia — o sea, la operación de la
 * tienda. Separarlos mantiene el criterio que ya sigue el resto del proyecto:
 * un secreto por capacidad, y el radio de daño acotado a esa capacidad.
 *
 * Sin `ADMIN_CAPTURE_SECRET` configurado responde 401 a todo. Es deliberado:
 * una instalación que no lo tenga no debe quedarse con un endpoint de escritura
 * abierto por olvido.
 */
export function requireAdminCapture(request: Request): NextResponse | null {
  const secret = process.env.ADMIN_CAPTURE_SECRET?.trim();
  // Se recorta el header antes de comparar. La comparación es byte a byte, así
  // que un salto de línea o un espacio colado al pegar el token en el panel
  // externo devolvía 401 sin ninguna pista de por qué — y el espacio sobrante
  // no es material secreto, así que tolerarlo no debilita nada.
  const header = (request.headers.get("authorization") ?? "").trim();
  if (!secret || secret.length < 32 || !safeEquals(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado.", diagnostico: describeHeader(header, secret) }, { status: 401 });
  }
  return null;
}

/**
 * ⚠️ TEMPORAL — quitar cuando la captura desde Retool quede confirmada.
 *
 * Un 401 a secas no distingue entre "no llegó cabecera", "llegó sin Bearer" y
 * "llegó un token distinto", y esa ambigüedad ya costó una sesión entera de
 * depuración a ciegas. Describe la FORMA de lo recibido, nunca su contenido:
 * ni el token entrante ni el esperado salen de aquí.
 */
function describeHeader(header: string, secret: string | undefined) {
  const prefix = "Bearer ";
  const startsWithBearer = header.startsWith(prefix);
  return {
    cabeceraPresente: header.length > 0,
    longitudCabecera: header.length,
    empiezaConBearer: startsWithBearer,
    longitudTokenRecibido: startsWithBearer ? header.slice(prefix.length).length : 0,
    longitudTokenEsperado: secret?.length ?? 0,
    secretoConfigurado: Boolean(secret && secret.length >= 32)
  };
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
