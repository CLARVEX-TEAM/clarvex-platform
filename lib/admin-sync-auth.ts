import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Autoriza la sincronización manual desde el panel de administración externo.
 *
 * Tiene un secreto PROPIO y no reutiliza `CRON_SECRET` a propósito. Ese abre
 * todas las rutas `/api/cron/*` —difusiones, push a toda la plantilla, reportes,
 * refresco del demo—, y este secreto vive en una herramienta de terceros. Si se
 * filtra, lo peor que permite es sincronizar una fuente: exactamente lo que el
 * botón hace, y nada más.
 *
 * Sin `ADMIN_SYNC_SECRET` configurado la ruta responde 401 a todo. Es
 * deliberado: una instalación que no lo tenga no debe quedar con un endpoint de
 * escritura abierto por olvido.
 */
export function requireAdminSync(request: Request): NextResponse | null {
  const secret = process.env.ADMIN_SYNC_SECRET;
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
