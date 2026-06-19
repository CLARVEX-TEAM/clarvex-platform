import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
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
  replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } }
} as const;

// POST — enviar una imagen (foto / sticker). Multipart con campo "file".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

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

  let url: string;
  try {
    const key = `chat/${id}/${session.userId}-${Date.now()}-${crypto.randomUUID()}.${validation.extension}`;
    url = await uploadToR2(key, bytes, raw.type);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir la imagen." },
      { status: 500 }
    );
  }

  const replyToId = await resolveReplyTo(id, form?.get("replyToId")?.toString() || undefined);

  const message = await prisma.chatMessage.create({
    data: {
      roomId: id,
      senderId: session.userId,
      body: `[img:${url}]`,
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
