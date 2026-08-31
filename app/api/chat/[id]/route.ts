import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { isOnline, resolveReplyTo, serializeChatMessage, touchPresence } from "@/lib/chat";
import { chatMediaRejectionMessage, isAllowedChatMediaBody } from "@/lib/chat-message-guard";
import { publicarEnSlackSinEsperar } from "@/lib/slack";
import { aQuienAvisar } from "@/lib/chat-mentions";
import { canalPara, parsearAutores, parsearCanales, parsearSalasDirectas } from "@/lib/slack-chat";

/**
 * ¿Puede reflejarse esta sala en Slack?
 *
 * Las de grupo, sí. Un **chat directo solo si quien lo va a leer desde Slack es
 * una de las dos personas** — y se comprueba contra `ChatMember`, no contra la
 * variable de entorno. La configuración la escribe una persona y una persona se
 * equivoca; en la tienda hay un directo entre dos asesoras en el que la
 * gerencia no participa, y mapearlo por error lo publicaría.
 */
async function puedeReflejarse(tipo: "DIRECT" | "GROUP", roomId: string): Promise<boolean> {
  if (tipo === "GROUP") return true;

  const empleados = [...parsearAutores(process.env.SLACK_CHAT_AUTHORS).values()];
  if (empleados.length === 0) return false;

  const lector = await prisma.chatMember.findFirst({
    where: { roomId, user: { employeeNumber: { in: empleados } } },
    select: { id: true }
  });
  return Boolean(lector);
}

export const dynamic = "force-dynamic";

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true, photoUrl: true } },
  readBy: { select: { userId: true } },
  deliveredTo: { select: { userId: true } },
  reactions: { select: { userId: true, emoji: true } },
  mentions: { select: { userId: true } },
  replyTo: { select: { id: true, body: true, deletedAt: true, sender: { select: { name: true } } } }
} as const;

async function loadRoom(id: string, selfId: string) {
  const room = await prisma.chatRoom.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, photoUrl: true, role: true, lastSeenAt: true, birthDate: true, hireDate: true } } }
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
      // Cumpleanos y antiguedad los ve todo el equipo (celebraciones); los saldos
      // de RH no salen de aqui. Misma regla que /api/app-data.
      birthDate: m.user.birthDate ? m.user.birthDate.toISOString().slice(0, 10) : null,
      hireDate: m.user.hireDate ? m.user.hireDate.toISOString().slice(0, 10) : null,
      online: m.user.id === selfId ? true : isOnline(m.user.lastSeenAt),
      lastSeenAt: m.user.lastSeenAt ? m.user.lastSeenAt.toISOString() : null
    }))
  };
}

// GET — mensajes del room + marca entregados/leídos + presencia
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (isApiError(session)) return session;

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  // Demo: se leen los mensajes, pero no se marca presencia ni se generan recibos
  // de entrega/lectura. Los usuarios demo son compartidos entre visitantes.
  const readOnly = session.demo === true;

  if (!readOnly) await touchPresence(session.userId);

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
  const toDeliver = readOnly ? [] : incoming.filter((m) => !m.deliveredTo.some((d) => d.userId === session.userId)).map((m) => m.id);
  const toRead = readOnly ? [] : incoming.filter((m) => !m.readBy.some((r) => r.userId === session.userId)).map((m) => m.id);

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
  const session = await requireSession();
  if (isApiError(session)) return session;

  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.userId } }
  });
  if (!member) return NextResponse.json({ error: "No tienes acceso a este chat." }, { status: 403 });

  const body = (await request.json()) as { body?: string; replyToId?: string };
  const text = body.body?.trim();
  if (!text) return NextResponse.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Mensaje demasiado largo." }, { status: 400 });
  if (!isAllowedChatMediaBody(text)) {
    return NextResponse.json({ error: chatMediaRejectionMessage() }, { status: 400 });
  }

  // Validar que el mensaje citado exista y pertenezca a este room.
  const replyToId = await resolveReplyTo(id, body.replyToId);

  /*
   * Las menciones se resuelven ANTES de guardar y se almacenan.
   *
   * ⚠️ No se deducen del texto al leer: el nombre de una persona puede
   * cambiar, y entonces una mención vieja dejaría de existir —o peor,
   * empezaría a apuntar a otra—. A quién se mencionó es un hecho del momento
   * en que se escribió.
   */
  const miembros = await prisma.chatMember.findMany({
    where: { roomId: id },
    select: { userId: true, user: { select: { name: true } } }
  });
  const mencionables = miembros.map((m) => ({ userId: m.userId, name: m.user.name }));
  const aviso = aQuienAvisar(text, mencionables, session.userId, miembros.map((m) => m.userId));

  const message = await prisma.chatMessage.create({
    data: {
      roomId: id,
      senderId: session.userId,
      body: text,
      replyToId,
      // El emisor ya tiene su propio mensaje entregado y leído.
      readBy: { create: { userId: session.userId } },
      deliveredTo: { create: { userId: session.userId } },
      mentions: { create: aviso.userIds.map((userId) => ({ userId })) }
    },
    include: MESSAGE_INCLUDE
  });

  const otherIds = miembros.map((m) => m.userId).filter((userId) => userId !== session.userId);
  const room = await prisma.chatRoom.findUnique({ where: { id } });
  const roomLabel = room?.type === "GROUP" ? "Chat Todos" : session.name;

  if (otherIds.length > 0) {
    /*
     * ⚠️ A quien se menciona se le avisa DISTINTO, y una sola vez.
     *
     * Sin esto, en un grupo avisas a todos o a nadie: el aviso deja de
     * significar nada y se acaba silenciando el chat entero.
     */
    const mencionados = new Set(aviso.userIds);
    const resto = otherIds.filter((userId) => !mencionados.has(userId));

    if (mencionados.size > 0) {
      void dispatchPushToUsers([...mencionados], {
        title: aviso.aTodos
          ? session.name + ' avisó a todos'
          : session.name + ' te mencionó',
        body: text.slice(0, 80),
        tag: `chat-${id}`,
        url: `/chat/${id}`
      });
    }
    if (resto.length > 0) {
      void dispatchPushToUsers(resto, {
        title: roomLabel ?? "Nuevo mensaje",
        body: `${session.name}: ${text.slice(0, 80)}`,
        tag: `chat-${id}`,
        url: `/chat/${id}`
      });
    }
  }

  /*
   * Espejo a Slack, para que la gerencia lea y conteste desde donde ya vive.
   *
   * ⚠️ Va DESPUÉS de guardar y sin esperar. El mensaje ya está en Clarvex y el
   * equipo lo ve; si Slack no responde, se pierde el reflejo, no el mensaje.
   *
   * Lo que entra POR Slack no pasa por aquí —se crea en el webhook— así que el
   * eco está cortado por construcción, no por una bandera que se pueda olvidar.
   */
  if (room) {
    const canal = canalPara(
      { id: room.id, tipo: room.type, storeId: room.storeId },
      parsearCanales(process.env.SLACK_CHAT_CHANNELS),
      parsearSalasDirectas(process.env.SLACK_DM_CHANNELS)
    );
    if (canal && (await puedeReflejarse(room.type, id))) {
      publicarEnSlackSinEsperar(canal, session.name ?? "Clarvex", text);
    }
  }

  return NextResponse.json({ message: serializeChatMessage(message) });
}
