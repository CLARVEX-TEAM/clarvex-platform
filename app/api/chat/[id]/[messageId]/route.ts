import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, deleteFromR2ByKey } from "@/lib/r2";

export const dynamic = "force-dynamic";

// DELETE — eliminar un mensaje.
//   ?scope=me  → ocultarlo solo para mí (cualquier miembro).
//   ?scope=all → eliminarlo para todos (solo el autor o gerencia).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId: id },
    select: { id: true, senderId: true, body: true, deletedAt: true }
  });
  if (!message) return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });

  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "me";

  if (scope === "me") {
    await prisma.chatMessageHide.upsert({
      where: { messageId_userId: { messageId, userId: session.userId } },
      update: {},
      create: { messageId, userId: session.userId }
    });
    return NextResponse.json({ ok: true, scope });
  }

  // scope === "all"
  const isManager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  if (message.senderId !== session.userId && !isManager) {
    return NextResponse.json({ error: "Solo puedes eliminar tus propios mensajes." }, { status: 403 });
  }

  if (!message.deletedAt) {
    await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    // Liberar la imagen en R2 si el mensaje era una foto.
    const proxyMatch = /^\[img:\/api\/chat\/file\?k=([^\]]+)\]$/.exec(message.body);
    if (proxyMatch) {
      void deleteFromR2ByKey(decodeURIComponent(proxyMatch[1]));
    } else {
      const urlMatch = /^\[img:(https?:\/\/[^\]]+)\]$/.exec(message.body);
      if (urlMatch) void deleteFromR2(urlMatch[1]);
    }
  }

  return NextResponse.json({ ok: true, scope });
}
