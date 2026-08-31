import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, deleteFromR2ByKey } from "@/lib/r2";
import { serializeChatMessage } from "@/lib/chat";
import { isAllowedChatMediaBody } from "@/lib/chat-message-guard";
import { aQuienAvisar } from "@/lib/chat-mentions";

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, photoUrl: true } },
  readBy: { select: { userId: true } },
  deliveredTo: { select: { userId: true } },
  reactions: { select: { userId: true, emoji: true } },
  mentions: { select: { userId: true } },
  replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } }
} as const;

export const dynamic = "force-dynamic";

// DELETE — eliminar un mensaje.
//   ?scope=me  → ocultarlo solo para mí (cualquier miembro).
//   ?scope=all → eliminarlo para todos (solo el autor o gerencia).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

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

/** Cuánto tiempo se puede corregir un mensaje. */
const MINUTOS_PARA_EDITAR = 15;

/**
 * PATCH — corregir el texto de un mensaje, o fijarlo arriba de la sala.
 *
 *   { body: "..." }      corrige el texto (solo el autor, y dentro de 15 min)
 *   { pinned: true }     lo fija (o lo suelta con false)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, roomId: id },
    select: { id: true, senderId: true, body: true, deletedAt: true, createdAt: true, pinnedAt: true }
  });
  if (!message) return NextResponse.json({ error: "Mensaje no encontrado." }, { status: 404 });
  if (message.deletedAt) return NextResponse.json({ error: "El mensaje está eliminado." }, { status: 409 });

  const payload = (await request.json().catch(() => ({}))) as { body?: string; pinned?: boolean };

  /* ─── fijar ─────────────────────────────────────────────────────────────── */
  if (typeof payload.pinned === "boolean") {
    /*
     * ⚠️ Solo UNO fijado por sala. Con varios deja de ser «lo importante de la
     * semana» y se vuelve otra lista que nadie mira; el anterior se suelta solo.
     */
    if (payload.pinned) {
      await prisma.chatMessage.updateMany({
        where: { roomId: id, pinnedAt: { not: null } },
        data: { pinnedAt: null, pinnedById: null }
      });
    }
    const actualizado = await prisma.chatMessage.update({
      where: { id: messageId },
      data: payload.pinned
        ? { pinnedAt: new Date(), pinnedById: session.userId }
        : { pinnedAt: null, pinnedById: null },
      include: MESSAGE_INCLUDE
    });
    return NextResponse.json({ ok: true, message: serializeChatMessage(actualizado) });
  }

  /* ─── corregir ──────────────────────────────────────────────────────────── */
  const texto = payload.body?.trim();
  if (!texto) return NextResponse.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
  if (texto.length > 1000) return NextResponse.json({ error: "Mensaje demasiado largo." }, { status: 400 });

  /*
   * ⚠️ Solo el AUTOR, ni siquiera gerencia. Borrar el mensaje de alguien se ve;
   * reescribirlo poniéndole otras palabras en la boca, no. Gerencia conserva el
   * borrado, que deja huella.
   */
  if (message.senderId !== session.userId) {
    return NextResponse.json({ error: "Solo puedes corregir tus propios mensajes." }, { status: 403 });
  }

  /*
   * ⚠️ Y solo dentro de los primeros 15 minutos. Sin límite,
   * una conversación vieja se puede reescribir entera y las respuestas de los
   * demás quedan contestando a algo que ya no existe.
   */
  const minutos = (Date.now() - message.createdAt.getTime()) / 60000;
  if (minutos > MINUTOS_PARA_EDITAR) {
    return NextResponse.json(
      { error: `Solo se puede corregir dentro de los primeros ${MINUTOS_PARA_EDITAR} minutos.` },
      { status: 409 }
    );
  }

  /*
   * ⚠️ Una foto o un GIF no se «corrigen»: cambiar el archivo dejando el mismo
   * mensaje sería sustituir lo que otros ya vieron. Para eso está borrar.
   */
  if (!isAllowedChatMediaBody(texto) || /^\[(img|gif|sticker):/.test(message.body)) {
    return NextResponse.json({ error: "Ese mensaje no se puede corregir; bórralo y manda otro." }, { status: 400 });
  }

  // Las menciones se recalculan: si añades un @, tiene que avisar.
  const miembros = await prisma.chatMember.findMany({
    where: { roomId: id },
    select: { userId: true, user: { select: { name: true } } }
  });
  const aviso = aQuienAvisar(
    texto,
    miembros.map((m) => ({ userId: m.userId, name: m.user.name })),
    session.userId,
    miembros.map((m) => m.userId)
  );
  await prisma.chatMention.deleteMany({ where: { messageId } });

  const actualizado = await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      body: texto,
      // Se marca «editado»: cambiar lo dicho sin que se note es peor que no
      // poder corregir.
      editedAt: new Date(),
      mentions: { create: aviso.userIds.map((userId) => ({ userId })) }
    },
    include: MESSAGE_INCLUDE
  });
  return NextResponse.json({ ok: true, message: serializeChatMessage(actualizado) });
}
