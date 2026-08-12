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
  const header = (request.headers.get("authorization") ?? "").trim();
  if (!secret || secret.length < 32 || !safeEquals(normalizeBearer(header), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}

/**
 * Deja la cabecera como `Bearer <token sin espacios en blanco>`.
 *
 * Se ignora TODO el blanco del token, no solo el de los extremos. Un espacio
 * colado al pegar el secreto en el panel externo —donde el campo parte el valor
 * visualmente y el intruso queda a media cadena— producía un 401 idéntico al de
 * un token equivocado, y costó más de una hora de depuración a ciegas.
 *
 * No debilita la comprobación: el blanco no aporta entropía y los 64 caracteres
 * hexadecimales siguen teniendo que coincidir uno a uno. Solo se toca el token,
 * nunca el esquema: si no viene un `Bearer` reconocible se devuelve la cabecera
 * tal cual y la comparación falla como debe.
 */
function normalizeBearer(header: string): string {
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return header;
  return prefix + header.slice(prefix.length).replace(/\s+/g, "");
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
