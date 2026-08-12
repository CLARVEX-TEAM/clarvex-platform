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
  const secret = process.env.ADMIN_CAPTURE_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !safeEquals(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
