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
};

export type ChatMemberView = { id: string; name: string; photoUrl: string | null; role: string; online: boolean; lastSeenAt: string | null };

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
