"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Send, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";

type RoomSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  other: { id: string; name: string; photoUrl: string | null; role: string } | null;
  lastMessage: { body: string; senderName: string; createdAt: string } | null;
  unreadCount: number;
};

type Message = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  senderPhoto: string | null;
  createdAt: string;
  readBy: string[];
};

type RoomInfo = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  members: { id: string; name: string; photoUrl: string | null; role: string }[];
};

type Teammate = { id: string; name: string; photoUrl: string | null };

export default function EscritorioChat() {
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [team, setTeam] = useState<Teammate[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/chat", { cache: "no-store" }).then(
      (r) => r.json() as Promise<{ rooms: RoomSummary[] }>
    );
    setRooms(res.rooms ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [currentUser, , appData] = await Promise.all([getSession(), loadRooms(), fetchAppData()]);
        setUser(currentUser);
        setTeam(appData.users.map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl ?? null })));
      } finally {
        setLoadingRooms(false);
      }
    })();
  }, [loadRooms]);

  const fetchMessages = useCallback(async (roomId: string) => {
    const res = await fetch(`/api/chat/${roomId}`, { cache: "no-store" }).then(
      (r) => r.json() as Promise<{ messages: Message[]; room: RoomInfo | null }>
    );
    setMessages(res.messages);
    if (res.room) setRoomInfo(res.room);
    // Actualizar unread en sidebar
    setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, unreadCount: 0 } : r));
  }, []);

  useEffect(() => {
    if (!activeRoomId) return;
    setLoadingMessages(true);
    fetchMessages(activeRoomId).finally(() => setLoadingMessages(false));
  }, [activeRoomId, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Polling cada 3 s cuando hay room activo
  useEffect(() => {
    if (!activeRoomId) return;
    const interval = setInterval(() => { void fetchMessages(activeRoomId); void loadRooms(); }, 3000);
    return () => clearInterval(interval);
  }, [activeRoomId, fetchMessages, loadRooms]);

  async function openRoom(roomId: string) {
    setActiveRoomId(roomId);
    setMessages([]);
    setRoomInfo(null);
  }

  async function openDirect(targetId: string) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: targetId })
    }).then((r) => r.json() as Promise<{ room: { id: string } }>);
    await loadRooms();
    await openRoom(res.room.id);
  }

  async function sendMessage() {
    if (!activeRoomId || !input.trim() || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    try {
      const res = await fetch(`/api/chat/${activeRoomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text })
      }).then((r) => r.json() as Promise<{ message: Message }>);
      setMessages((prev) => [...prev, res.message]);
      await loadRooms();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
    if (diffDays === 1) return "Ayer";
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }

  function dayLabel(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  }

  function sameDay(a: string, b: string) { return a.slice(0, 10) === b.slice(0, 10); }

  const activeRoomTitle = roomInfo
    ? roomInfo.type === "GROUP"
      ? (roomInfo.name ?? "Todos")
      : roomInfo.members.find((m) => m.id !== user?.id)?.name ?? "Chat"
    : "";

  const activeRoomSubtitle = roomInfo?.type === "GROUP"
    ? `${roomInfo.members.length} integrantes`
    : roomInfo?.members.find((m) => m.id !== user?.id)?.role?.toLowerCase() ?? "";

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden rounded-2xl border border-line bg-white/60 dark:bg-[#0f1729]/60">
      {/* ─── Panel izquierdo: lista de rooms ─── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <div className="border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-volt" size={18} />
            <h2 className="text-base font-black">Chat</h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingRooms ? (
            <p className="px-4 py-4 text-sm text-muted">Cargando…</p>
          ) : (
            <>
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => void openRoom(room.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line/40 px-4 py-3 text-left transition-colors",
                    activeRoomId === room.id ? "bg-volt/10" : "hover:bg-volt/5"
                  )}
                >
                  <div className="relative shrink-0">
                    {room.type === "GROUP" ? (
                      <span className="grid size-10 place-items-center rounded-2xl bg-volt/15 text-volt">
                        <Users size={18} />
                      </span>
                    ) : (
                      <ProfileAvatar name={room.other?.name ?? "?"} photoUrl={room.other?.photoUrl} size="sm" className="size-10 rounded-2xl" />
                    )}
                    {room.unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-volt text-[9px] font-black text-white">
                        {room.unreadCount > 9 ? "9+" : room.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("truncate text-sm font-bold", room.unreadCount > 0 ? "text-ink" : "text-ink/80")}>
                        {room.type === "GROUP" ? (room.name ?? "Todos") : room.other?.name}
                      </p>
                      {room.lastMessage && (
                        <span className="shrink-0 text-[10px] text-muted">{formatTime(room.lastMessage.createdAt)}</span>
                      )}
                    </div>
                    {room.lastMessage ? (
                      <p className={cn("truncate text-xs", room.unreadCount > 0 ? "font-semibold text-ink/70" : "text-muted")}>
                        {room.type === "GROUP" ? `${room.lastMessage.senderName}: ` : ""}{room.lastMessage.body}
                      </p>
                    ) : (
                      <p className="text-xs text-muted">Sin mensajes</p>
                    )}
                  </div>
                </button>
              ))}

              {/* Iniciar directo */}
              {team.filter((t) => t.id !== user?.id && !rooms.some((r) => r.type === "DIRECT" && r.other?.id === t.id)).length > 0 && (
                <div className="px-4 py-2">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Nuevo mensaje</p>
                  {team
                    .filter((t) => t.id !== user?.id && !rooms.some((r) => r.type === "DIRECT" && r.other?.id === t.id))
                    .map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => void openDirect(member.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-volt/8"
                      >
                        <ProfileAvatar name={member.name} photoUrl={member.photoUrl} size="sm" className="size-8 rounded-xl text-xs" />
                        <span className="text-sm font-semibold text-ink">{member.name}</span>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Panel derecho: conversación ─── */}
      <div className="flex flex-1 flex-col">
        {!activeRoomId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-16 place-items-center rounded-[28px] bg-volt/12 text-volt">
              <MessageSquare size={28} />
            </span>
            <p className="text-base font-black text-ink">Selecciona un chat</p>
            <p className="text-sm text-muted">Elige una conversación o inicia un nuevo mensaje directo.</p>
          </div>
        ) : (
          <>
            {/* Header de conversación */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              {roomInfo?.type === "GROUP" ? (
                <span className="grid size-9 place-items-center rounded-2xl bg-volt/12 text-volt">
                  <Users size={17} />
                </span>
              ) : roomInfo ? (
                <ProfileAvatar
                  name={roomInfo.members.find((m) => m.id !== user?.id)?.name ?? "?"}
                  photoUrl={roomInfo.members.find((m) => m.id !== user?.id)?.photoUrl}
                  size="sm"
                  className="size-9 rounded-2xl"
                />
              ) : null}
              <div>
                <p className="text-sm font-black text-ink">{activeRoomTitle}</p>
                {activeRoomSubtitle && <p className="text-xs text-muted">{activeRoomSubtitle}</p>}
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 pt-4">
              {loadingMessages ? (
                <p className="py-8 text-center text-sm text-muted">Cargando mensajes…</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">Sé el primero en escribir 👋</p>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.senderId === user?.id;
                  const showDay = i === 0 || !sameDay(messages[i - 1].createdAt, msg.createdAt);
                  const showAvatar = !isMe && (i === 0 || messages[i - 1].senderId !== msg.senderId || showDay);

                  return (
                    <div key={msg.id}>
                      {showDay && (
                        <div className="my-3 flex items-center gap-2">
                          <div className="h-px flex-1 bg-line/50" />
                          <span className="rounded-full bg-panel px-3 py-1 text-[11px] font-bold text-muted shadow-sm">
                            {dayLabel(msg.createdAt)}
                          </span>
                          <div className="h-px flex-1 bg-line/50" />
                        </div>
                      )}
                      <div className={cn("mb-1 flex items-end gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                        <div className="w-8 shrink-0">
                          {showAvatar && !isMe && (
                            <ProfileAvatar name={msg.senderName} photoUrl={msg.senderPhoto} size="sm" className="size-8 rounded-xl text-xs" />
                          )}
                        </div>
                        <div className={cn("max-w-[60%]", isMe ? "items-end" : "items-start", "flex flex-col")}>
                          {showAvatar && !isMe && roomInfo?.type === "GROUP" && (
                            <span className="mb-0.5 pl-1 text-[11px] font-bold text-muted">{msg.senderName}</span>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                              isMe
                                ? "rounded-br-sm bg-volt text-white"
                                : "rounded-bl-sm bg-white/90 text-ink dark:bg-white/10"
                            )}
                          >
                            {msg.body}
                          </div>
                          <span className={cn("mt-0.5 text-[10px] text-muted", isMe ? "pr-1 text-right" : "pl-1")}>
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-line px-5 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje…"
                  rows={1}
                  maxLength={1000}
                  className="flex-1 resize-none rounded-2xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
                  style={{ maxHeight: "120px", overflowY: "auto" }}
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || sending}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt text-white shadow-md transition hover:bg-volt/90 active:scale-95 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
