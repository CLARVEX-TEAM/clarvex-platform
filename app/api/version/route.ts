import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Huella del build que está sirviendo el servidor AHORA.
 *
 * El cliente lleva la suya incrustada (NEXT_PUBLIC_BUILD_ID, fijada al compilar).
 * Si esta no coincide, ese navegador está corriendo código viejo.
 *
 * Público a propósito: no revela nada (es una cadena opaca) y así también
 * funciona en la pantalla de login.
 */
export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
