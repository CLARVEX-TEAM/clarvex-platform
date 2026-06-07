import { NextResponse } from "next/server";
import { getServerSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesion requerida." }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { id: session.userId, storeId: session.storeId }, include: { store: { select: { name: true } } } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  return NextResponse.json({ user: { ...publicUser(user), storeName: user.store.name } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
