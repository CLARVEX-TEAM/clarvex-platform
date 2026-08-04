import { NextResponse } from "next/server";
import { getServerSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/security";
import { hasRealEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { id: session.userId, storeId: session.storeId }, include: { store: { select: { name: true, kpisEnabled: true } } } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  // `needsEmail`: sin correo real no puede recuperar su PIN solo (la app le puso
  // un relleno al darlo de alta). Lo consume el aviso global EmailBanner.
  return NextResponse.json({ user: { ...publicUser(user), storeName: user.store.name, kpisEnabled: user.store.kpisEnabled, platformAdmin: user.platformAdmin, checklistOnly: user.checklistOnly, demo: user.isDemo, needsEmail: !hasRealEmail(user.email) } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  // Invalida el token actual (y otras sesiones del usuario) subiendo
  // sessionVersion: un token robado deja de servir tras el logout.
  //
  // EXCEPCIÓN demo: los usuarios del demo público son COMPARTIDOS (DEMO-100 /
  // DEMO-201), así que subir la versión echaría de la app a todos los visitantes
  // conectados en ese momento — cualquiera podría tumbar el demo con solo cerrar
  // sesión. Ahí basta con borrar la cookie: no hay nada que proteger en una
  // sesión de solo lectura sobre datos ficticios.
  const session = await getServerSession();
  if (session && !session.demo) {
    await prisma.user.update({ where: { id: session.userId }, data: { sessionVersion: { increment: 1 } } }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
