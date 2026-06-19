import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST — alternar reacción del usuario sobre un mensaje.
//   - Sin reacción previa → la agrega.
//   - Misma reacción → la quita (toggle).
//   - Reacción distinta → la reemplaza.
export async function POST(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { emoji?: string };
  const emoji = body.emoji?.trim();
  if (!emoji || emoji.length > 16) return NextResponse.json({ error: "Emoji inválido." }, { status: 400 });

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId: id, deletedAt: null },
    select: { id: true }
  });
  if (!message) return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });

  const existing = await prisma.chatMessageReaction.findUnique({
    where: { messageId_userId: { messageId, userId: session.userId } }
  });

  if (existing && existing.emoji === emoji) {
    await prisma.chatMessageReaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.chatMessageReaction.update({ where: { id: existing.id }, data: { emoji } });
  } else {
    await prisma.chatMessageReaction.create({ data: { messageId, userId: session.userId, emoji } });
  }

  const reactions = await prisma.chatMessageReaction.findMany({
    where: { messageId },
    select: { userId: true, emoji: true }
  });

  return NextResponse.json({ reactions });
}
