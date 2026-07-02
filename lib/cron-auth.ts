import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Autoriza una ruta cron comparando el header Authorization contra CRON_SECRET
// en tiempo constante. Devuelve null si está autorizado, o la respuesta 401.
export function requireCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEquals(header, `Bearer ${secret}`)) {
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
