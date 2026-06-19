import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

// GET — mensajes del room (últimos 60, más viejos primero) + marca como leídos
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const messages = await prisma.chatMessage.findMany({
    where: { roomId: id },
    orderBy: { createdAt: "asc" },
    take: 60,
    include: {
      sender: { select: { id: true, name: true, photoUrl: true } },
      readBy: { select: { userId: true } }
    }
  });

  // Marcar como leídos los mensajes de otros
  const unreadIds = messages
    .filter((m) => m.senderId !== session.userId && !m.readBy.some((r) => r.userId === session.userId))
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await prisma.chatMessageRead.createMany({
      data: unreadIds.map((messageId) => ({ messageId, userId: session.userId })),
      skipDuplicates: true
    });
  }

  const room = await prisma.chatRoom.findUnique({
    where: { id },
    include: { members: { include: { user: { select: { id: true, name: true, photoUrl: true, role: true } } } } }
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderPhoto: m.sender.photoUrl,
      createdAt: m.createdAt.toISOString(),
      readBy: m.readBy.map((r) => r.userId)
    })),
    room: room
      ? {
          id: room.id,
          type: room.type,
          name: room.name,
          members: room.members.map((m) => ({ id: m.user.id, name: m.user.name, photoUrl: m.user.photoUrl, role: m.user.role }))
        }
      : null
  });
}

// POST — enviar mensaje
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const body = await request.json() as { body?: string };
  const text = body.body?.trim();
  if (!text) return NextResponse.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Mensaje demasiado largo." }, { status: 400 });

  const message = await prisma.chatMessage.create({
    data: { roomId: id, senderId: session.userId, body: text },
    include: { sender: { select: { id: true, name: true, photoUrl: true } } }
  });

  // Marcar como leído por el propio emisor
  await prisma.chatMessageRead.create({ data: { messageId: message.id, userId: session.userId } });

  // Push a los otros miembros
  const otherMembers = await prisma.chatMember.findMany({
    where: { roomId: id, userId: { not: session.userId } },
    select: { userId: true }
  });
  const otherIds = otherMembers.map((m) => m.userId);

  const room = await prisma.chatRoom.findUnique({ where: { id } });
  const roomLabel = room?.type === "GROUP" ? "Chat Todos" : session.name;

  if (otherIds.length > 0) {
    void dispatchPushToUsers(otherIds, {
      title: roomLabel ?? "Nuevo mensaje",
      body: `${session.name}: ${text.slice(0, 80)}`,
      tag: `chat-${id}`,
      url: `/chat/${id}`
    });
  }

  return NextResponse.json({
    message: {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderPhoto: message.sender.photoUrl,
      createdAt: message.createdAt.toISOString(),
      readBy: [session.userId]
    }
  });
}
