import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { VIGENCIA_DIAS, firmarCredencial } from "@/lib/credencial";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Emite la credencial de quien la pide. Siempre la suya.
 *
 * ⚠️ **No recibe a quién acreditar.** Sale de la sesión, nunca de un parámetro:
 * lo contrario permitiría pedir la credencial de cualquier compañero cambiando
 * un id en la URL.
 *
 * El enlace se renueva cada vez que se abre la pantalla, así que una credencial
 * se mantiene fresca sola y un enlace viejo caduca sin que nadie haga nada.
 */
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const user = await prisma.user.findFirst({
    where: { id: session.userId, storeId: session.storeId, active: true },
    select: { id: true, name: true, role: true, photoUrl: true, store: { select: { name: true } } }
  });
  if (!user) return NextResponse.json({ error: "No se encontró tu credencial." }, { status: 404 });

  const expira = Math.floor(Date.now() / 1000) + VIGENCIA_DIAS * 86_400;
  const token = firmarCredencial({ u: user.id, s: session.storeId, exp: expira });

  return NextResponse.json({
    nombre: user.name,
    puesto: user.role,
    tienda: user.store?.name ?? "—",
    foto: await signR2Url(user.photoUrl),
    vigenteHasta: new Date(expira * 1000).toISOString(),
    /*
     * Ruta RELATIVA. El origen lo pone quien pinta el QR, que es el navegador:
     * fijarlo aquí ataría la credencial al dominio de hoy — y este proyecto ya
     * se mudó de dominio una vez.
     */
    ruta: `/v/${token}`
  }, { headers: { "Cache-Control": "private, no-store" } });
}
