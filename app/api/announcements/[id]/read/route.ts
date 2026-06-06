import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { actorId, userId, read } = await request.json();

  if (!actorId || !userId) {
    return NextResponse.json({ error: "Actor y usuario son requeridos." }, { status: 400 });
  }

  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) {
    return NextResponse.json({ error: "Actor no encontrado." }, { status: 404 });
  }

  if (actor.role === "ASESOR" && actor.id !== userId) {
    return NextResponse.json({ error: "Un asesor solo puede marcar su propia lectura." }, { status: 403 });
  }

  if (read) {
    await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: params.id, userId } },
      update: { readAt: new Date() },
      create: { announcementId: params.id, userId }
    });
  } else {
    await prisma.announcementRead.deleteMany({
      where: { announcementId: params.id, userId }
    });
  }

  return NextResponse.json({ ok: true });
}
