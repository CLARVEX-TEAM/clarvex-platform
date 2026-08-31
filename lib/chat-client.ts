"use client";

// Tipos y llamadas a la API del chat compartidos entre la vista móvil
// (app/chat/[id]) y la de escritorio (app/escritorio/chat). Cada página
// mantiene su propio manejo de estado; aquí solo vive el plumbing HTTP.
import type { MessageReaction, ReplyInfo } from "@/components/ChatPicker";

export type ChatMessageView = {
  id: string;
  body: string;
  deleted: boolean;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  createdAt: string;
  readBy: string[];
  deliveredTo: string[];
  reactions: MessageReaction[];
  replyTo: ReplyInfo | null;
  /** Cuándo se corrigió. La pantalla lo marca: cambiar lo dicho sin que se
   *  note es peor que no poder corregir. */
  editedAt: string | null;
  pinnedAt: string | null;
  /** A quién se mencionó, resuelto al escribir y no al leer. */
  mentions: string[];
};

export type ChatMemberView = {
  id: string;
  name: string;
  photoUrl: string | null;
  role: string;
  online: boolean;
  lastSeenAt: string | null;
  // Cumpleaños y antigüedad los ve todo el equipo (celebraciones). Los saldos
  // de RH NO viajan por aquí: son de gerencia o de uno mismo.
  birthDate: string | null;
  hireDate: string | null;
};

export type ChatRoomInfoView = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  members: ChatMemberView[];
};

export type ChatRoomSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  other: { id: string; name: string; photoUrl: string | null; role: string; online: boolean; lastSeenAt: string | null } | null;
  lastMessage: { body: string; deleted: boolean; senderName: string; createdAt: string } | null;
  unreadCount: number;
};

export async function fetchChatRooms(): Promise<ChatRoomSummary[]> {
  const res = await fetch("/api/chat", { cache: "no-store" }).then(
    (r) => r.json() as Promise<{ rooms: ChatRoomSummary[] }>
  );
  return res.rooms ?? [];
}

export async function openDirectChat(targetUserId: string): Promise<{ id: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUserId })
  }).then((r) => r.json() as Promise<{ room: { id: string } }>);
  return res.room;
}

export async function fetchChatRoom(roomId: string): Promise<{ messages: ChatMessageView[]; room: ChatRoomInfoView | null }> {
  return fetch(`/api/chat/${roomId}`, { cache: "no-store" }).then(
    (r) => r.json() as Promise<{ messages: ChatMessageView[]; room: ChatRoomInfoView | null }>
  );
}

export async function postChatMessage(roomId: string, body: string, replyToId?: string): Promise<ChatMessageView> {
  const res = await fetch(`/api/chat/${roomId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, replyToId })
  }).then((r) => r.json() as Promise<{ message: ChatMessageView }>);
  return res.message;
}

export async function postChatImage(roomId: string, file: File, replyToId?: string): Promise<{ message?: ChatMessageView; error?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  if (replyToId) fd.append("replyToId", replyToId);
  return fetch(`/api/chat/${roomId}/image`, { method: "POST", body: fd }).then(
    (r) => r.json() as Promise<{ message?: ChatMessageView; error?: string }>
  );
}

export async function postChatReaction(roomId: string, messageId: string, emoji: string): Promise<MessageReaction[] | undefined> {
  const res = await fetch(`/api/chat/${roomId}/${messageId}/reaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emoji })
  }).then((r) => r.json() as Promise<{ reactions?: MessageReaction[] }>);
  return res.reactions;
}

export async function deleteChatMessage(roomId: string, messageId: string, scope: "me" | "all"): Promise<void> {
  await fetch(`/api/chat/${roomId}/${messageId}?scope=${scope}`, { method: "DELETE" });
}

/**
 * Corrige el texto de un mensaje propio.
 *
 * ⚠️ El servidor solo lo permite al AUTOR y dentro de 15 minutos, y marca el
 * mensaje como editado. Aquí no se replica esa regla: duplicarla haría que la
 * pantalla y el servidor pudieran acabar diciendo cosas distintas.
 */
export async function editChatMessage(roomId: string, messageId: string, body: string): Promise<ChatMessageView> {
  const res = await fetch(`/api/chat/${roomId}/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });
  const data = (await res.json()) as { message?: ChatMessageView; error?: string };
  if (!res.ok || !data.message) throw new Error(data.error ?? "No se pudo corregir el mensaje.");
  return data.message;
}

/** Fija un mensaje arriba de la sala, o lo suelta. Solo uno a la vez. */
export async function pinChatMessage(roomId: string, messageId: string, pinned: boolean): Promise<ChatMessageView> {
  const res = await fetch(`/api/chat/${roomId}/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned })
  });
  const data = (await res.json()) as { message?: ChatMessageView; error?: string };
  if (!res.ok || !data.message) throw new Error(data.error ?? "No se pudo fijar el mensaje.");
  return data.message;
}

export type ChatSearchHit = {
  id: string;
  roomId: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  roomLabel: string;
};

/** Busca en las conversaciones de las que eres miembro. */
export async function searchChat(q: string, roomId?: string): Promise<ChatSearchHit[]> {
  const params = new URLSearchParams({ q });
  if (roomId) params.set("roomId", roomId);
  const res = await fetch(`/api/chat/search?${params}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ChatSearchHit[] };
  return data.results ?? [];
}
