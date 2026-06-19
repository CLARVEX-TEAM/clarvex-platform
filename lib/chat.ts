import { prisma } from "@/lib/prisma";

// Ventana de presencia: si el último latido fue hace menos de esto, el usuario
// se considera "en línea". El polling del chat es cada 3 s, así que 35 s deja
// margen para un par de ciclos perdidos sin marcar como desconectado.
export const PRESENCE_WINDOW_MS = 35_000;

export function isOnline(lastSeenAt: Date | null | undefined): boolean {
  return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < PRESENCE_WINDOW_MS;
}

// Actualiza el "visto por última vez" del usuario. Se llama en cada lectura de
// chat (lista o conversación). No bloquea la respuesta si falla.
export async function touchPresence(userId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

type RawChatMessage = {
  id: string;
  body: string;
  senderId: string;
  deletedAt: Date | null;
  createdAt: Date;
  sender: { name: string; photoUrl: string | null };
  readBy: { userId: string }[];
  deliveredTo: { userId: string }[];
};

export type SerializedChatMessage = {
  id: string;
  body: string;
  deleted: boolean;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  createdAt: string;
  readBy: string[];
  deliveredTo: string[];
};

export function serializeChatMessage(m: RawChatMessage): SerializedChatMessage {
  return {
    id: m.id,
    // No exponer el contenido de un mensaje eliminado para todos.
    body: m.deletedAt ? "" : m.body,
    deleted: m.deletedAt !== null,
    senderId: m.senderId,
    senderName: m.sender.name,
    senderPhoto: m.sender.photoUrl,
    createdAt: m.createdAt.toISOString(),
    readBy: m.readBy.map((r) => r.userId),
    deliveredTo: m.deliveredTo.map((d) => d.userId)
  };
}
