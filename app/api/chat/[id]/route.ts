import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { isOnline, resolveReplyTo, serializeChatMessage, touchPresence } from "@/lib/chat";

export const dynamic = "force-dynamic";

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, photoUrl: true } },
  readBy: { select: { userId: true } },
  deliveredTo: { select: { userId: true } },
  replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } }
} as const;

async function loadRoom(id: string, selfId: string) {
  const room = await prisma.chatRoom.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, photoUrl: true, role: true, lastSeenAt: true } } }
      }
    }
  });
  if (!room) return null;
  return {
    id: room.id,
    type: room.type,
    name: room.name,
    members: room.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      photoUrl: m.user.photoUrl,
      role: m.user.role,
      online: m.user.id === selfId ? true : isOnline(m.user.lastSeenAt),
      lastSeenAt: m.user.lastSeenAt ? m.user.lastSeenAt.toISOString() : null
    }))
  };
}

// GET — mensajes del room + marca entregados/leídos + presencia
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  await touchPresence(session.userId);

  const messages = await prisma.chatMessage.findMany({
    where: {
      roomId: id,
      // Ocultar los mensajes que el usuario eliminó solo para sí mismo.
      hiddenFor: { none: { userId: session.userId } }
    },
    orderBy: { createdAt: "asc" },
    take: 60,
    include: MESSAGE_INCLUDE
  });

  // Al abrir la conversación: los mensajes ajenos quedan entregados y vistos.
  const incoming = messages.filter((m) => m.senderId !== session.userId);
  const toDeliver = incoming.filter((m) => !m.deliveredTo.some((d) => d.userId === session.userId)).map((m) => m.id);
  const toRead = incoming.filter((m) => !m.readBy.some((r) => r.userId === session.userId)).map((m) => m.id);

  if (toDeliver.length > 0) {
    await prisma.chatMessageDelivery.createMany({
      data: toDeliver.map((messageId) => ({ messageId, userId: session.userId })),
      skipDuplicates: true
    });
  }
  if (toRead.length > 0) {
    await prisma.chatMessageRead.createMany({
      data: toRead.map((messageId) => ({ messageId, userId: session.userId })),
      skipDuplicates: true
    });
  }

  // Reflejar en la respuesta lo recién marcado (sin re-consultar).
  const deliverSet = new Set(toDeliver);
  const readSet = new Set(toRead);
  for (const m of messages) {
    if (deliverSet.has(m.id)) m.deliveredTo.push({ userId: session.userId });
    if (readSet.has(m.id)) m.readBy.push({ userId: session.userId });
  }

  const room = await loadRoom(id, session.userId);

  return NextResponse.json({ messages: messages.map(serializeChatMessage), room });
}

// POST — enviar mensaje de texto
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const body = (await request.json()) as { body?: string; replyToId?: string };
  const text = body.body?.trim();
  if (!text) return NextResponse.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Mensaje demasiado largo." }, { status: 400 });

  // Validar que el mensaje citado exista y pertenezca a este room.
  const replyToId = await resolveReplyTo(id, body.replyToId);

  const message = await prisma.chatMessage.create({
    data: {
      roomId: id,
      senderId: session.userId,
      body: text,
      replyToId,
      // El emisor ya tiene su propio mensaje entregado y leído.
      readBy: { create: { userId: session.userId } },
      deliveredTo: { create: { userId: session.userId } }
    },
    include: MESSAGE_INCLUDE
  });

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

  return NextResponse.json({ message: serializeChatMessage(message) });
}
