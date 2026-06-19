import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const unread = await prisma.chatMessage.findMany({
    where: {
      roomId: id,
      senderId: { not: session.userId },
      readBy: { none: { userId: session.userId } }
    },
    select: { id: true }
  });

  if (unread.length > 0) {
    await prisma.chatMessageRead.createMany({
      data: unread.map((m) => ({ messageId: m.id, userId: session.userId })),
      skipDuplicates: true
    });
  }

  return NextResponse.json({ ok: true });
}
