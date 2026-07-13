import { NextResponse } from "next/server";
import { enforceUploadRateLimit, requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { validateEvidenceImage } from "@/lib/evidence";
import { uploadToR2 } from "@/lib/r2";
import { resolveReplyTo, serializeChatMessage } from "@/lib/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, photoUrl: true } },
  readBy: { select: { userId: true } },
  deliveredTo: { select: { userId: true } },
  reactions: { select: { userId: true, emoji: true } },
  replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } }
} as const;

// POST — enviar una imagen (foto / sticker). Multipart con campo "file".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;
  const limited = await enforceUploadRateLimit(session.userId);
  if (limited) return limited;

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const raw = form?.get("file");
  if (!(raw instanceof File)) return NextResponse.json({ error: "Selecciona una imagen." }, { status: 400 });

  const bytes = new Uint8Array(await raw.arrayBuffer());
  const validation = validateEvidenceImage(raw, bytes);
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

  const key = `evidences/chat/${id}/${session.userId}-${Date.now()}-${crypto.randomUUID()}.${validation.extension}`;
  try {
    await uploadToR2(key, bytes, raw.type);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir la imagen." },
      { status: 500 }
    );
  }

  const replyToId = await resolveReplyTo(id, form?.get("replyToId")?.toString() || undefined);

  // Se sirve por el proxy del backend (no por la URL pública de R2), así no
  // depende del acceso público del bucket y queda restringida a los miembros.
  const message = await prisma.chatMessage.create({
    data: {
      roomId: id,
      senderId: session.userId,
      body: `[img:/api/chat/file?k=${encodeURIComponent(key)}]`,
      replyToId,
      readBy: { create: { userId: session.userId } },
      deliveredTo: { create: { userId: session.userId } }
    },
    include: MESSAGE_INCLUDE
  });

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
      body: `${session.name}: 📷 Foto`,
      tag: `chat-${id}`,
      url: `/chat/${id}`
    });
  }

  return NextResponse.json({ message: serializeChatMessage(message) });
}
