"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare, Send, Smile, Users, ImagePlus, Trash2, MoreVertical, X, Reply } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";
import {
  ChatPicker,
  MessageTicks,
  ReplyQuote,
  ReactionBar,
  ReactionChips,
  computeMessageStatus,
  formatLastSeen,
  chatPreview,
  decodeStickerMsg,
  decodeGifMsg,
  decodeImageMsg,
  isBigEmoji,
  encodeStickerMsg,
  encodeGifMsg
} from "@/components/ChatPicker";
import {
  deleteChatMessage,
  fetchChatRoom,
  fetchChatRooms,
  openDirectChat,
  postChatImage,
  postChatMessage,
  postChatReaction,
  type ChatMessageView as Message,
  type ChatRoomInfoView as RoomInfo,
  type ChatRoomSummary as RoomSummary
} from "@/lib/chat-client";

type Teammate = { id: string; name: string; photoUrl: string | null };

function MessageBody({ msg, isMe, onImageClick }: { msg: Message; isMe: boolean; onImageClick?: (url: string) => void }) {
  if (msg.deleted) {
    return (
      <div className={cn(
        "flex items-center gap-1.5 rounded-2xl border border-dashed px-4 py-2.5 text-sm italic",
        isMe ? "border-on-accent/40 text-on-accent/80" : "border-line text-muted"
      )}>
        <Trash2 size={13} /> Se eliminó este mensaje
      </div>
    );
  }
  const sticker = decodeStickerMsg(msg.body);
  if (sticker) {
    return (
      <div className={cn("flex flex-col items-center gap-1 rounded-3xl bg-gradient-to-br p-4", sticker.bg)}>
        <span className="text-5xl leading-none">{sticker.emoji}</span>
        <span className="text-xs font-semibold text-ink">{sticker.label}</span>
      </div>
    );
  }
  const imgUrl = decodeImageMsg(msg.body);
  if (imgUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imgUrl}
        alt="Imagen"
        className="max-h-72 max-w-[260px] cursor-pointer rounded-2xl object-cover"
        loading="lazy"
        onClick={() => onImageClick?.(imgUrl)}
      />
    );
  }
  const gifUrl = decodeGifMsg(msg.body);
  if (gifUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={gifUrl} alt="GIF" className="max-w-[220px] rounded-2xl" loading="lazy" />
    );
  }
  if (isBigEmoji(msg.body)) {
    return <span className="text-5xl leading-none">{msg.body}</span>;
  }
  return (
    <div className={cn("rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm", isMe ? "rounded-br-sm bg-accent text-on-accent" : "rounded-bl-sm bg-panel text-ink")}>
      {msg.body}
    </div>
  );
}

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRooms = useCallback(async () => {
    setRooms(await fetchChatRooms());
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
    const res = await fetchChatRoom(roomId);
    setMessages(res.messages);
    if (res.room) setRoomInfo(res.room);
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

  // Polling cada 3 s cuando hay room activo; la lista refresca presencia.
  useEffect(() => {
    if (!activeRoomId) { const t = setInterval(() => { void loadRooms(); }, 5000); return () => clearInterval(t); }
    const interval = setInterval(() => { void fetchMessages(activeRoomId); void loadRooms(); }, 3000);
    return () => clearInterval(interval);
  }, [activeRoomId, fetchMessages, loadRooms]);

  async function openRoom(roomId: string) {
    setActiveRoomId(roomId);
    setMessages([]);
    setRoomInfo(null);
  }

  async function openDirect(targetId: string) {
    const room = await openDirectChat(targetId);
    await loadRooms();
    await openRoom(room.id);
  }

  async function doSend(body: string) {
    if (!activeRoomId || !body.trim() || sending) return;
    setSending(true);
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      const message = await postChatMessage(activeRoomId, body, replyToId);
      setMessages((prev) => [...prev, message]);
      await loadRooms();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function uploadImage(file: File) {
    if (!activeRoomId || sending || !file.type.startsWith("image/")) return;
    setSending(true);
    setPickerOpen(false);
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      const res = await postChatImage(activeRoomId, file, replyToId);
      if (res.message) { setMessages((prev) => [...prev, res.message!]); await loadRooms(); }
      else if (res.error) alert(res.error);
    } finally {
      setSending(false);
    }
  }

  async function reactToMessage(msg: Message, emoji: string) {
    setMenuMsg(null);
    if (!activeRoomId) return;
    const reactions = await postChatReaction(activeRoomId, msg.id, emoji);
    if (reactions) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions } : m)));
    }
  }

  function scrollToMessage(messageId: string) {
    const el = document.getElementById(`dmsg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent", "rounded-2xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-accent", "rounded-2xl"), 1200);
    }
  }

  async function deleteMessage(msg: Message, scope: "me" | "all") {
    setMenuMsg(null);
    if (!activeRoomId) return;
    await deleteChatMessage(activeRoomId, msg.id, scope);
    if (scope === "me") setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    else setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, deleted: true, body: "" } : m)));
    await loadRooms();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); void uploadImage(file); }
  }

  function handleSend() { const t = input.trim(); setInput(""); void doSend(t); }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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

  function msgTime(iso: string) {
    return new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
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

  const isManager = user?.role === "GERENTE" || user?.role === "SUBGERENTE";
  const otherMember = roomInfo?.members.find((m) => m.id !== user?.id) ?? null;
  const otherIds = roomInfo ? roomInfo.members.filter((m) => m.id !== user?.id).map((m) => m.id) : [];

  const activeRoomTitle = roomInfo
    ? roomInfo.type === "GROUP"
      ? (roomInfo.name ?? "Todos")
      : otherMember?.name ?? "Chat"
    : "";

  const activeRoomSubtitle = roomInfo?.type === "GROUP"
    ? `${roomInfo.members.length} integrantes`
    : otherMember
      ? (formatLastSeen(otherMember.lastSeenAt, otherMember.online) || otherMember.role.toLowerCase())
      : "";

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden rounded-2xl border border-line bg-card">
      {/* ─── Panel izquierdo: lista de rooms ─── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <div className="border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-accent" size={18} />
            <h2 className="text-base font-semibold">Chat</h2>
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
                    activeRoomId === room.id ? "bg-accent/10" : "hover:bg-accent/5"
                  )}
                >
                  <div className="relative shrink-0">
                    {room.type === "GROUP" ? (
                      <span className="grid size-10 place-items-center rounded-2xl bg-accent/15 text-accent">
                        <Users size={18} />
                      </span>
                    ) : (
                      <ProfileAvatar name={room.other?.name ?? "?"} photoUrl={room.other?.photoUrl} size="sm" className="size-10 rounded-2xl" />
                    )}
                    {room.type === "DIRECT" && room.other?.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[rgb(var(--color-card))] bg-ok" />
                    )}
                    {room.unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-semibold text-on-accent">
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
                        {room.type === "GROUP" ? `${room.lastMessage.senderName}: ` : ""}{chatPreview(room.lastMessage.body, room.lastMessage.deleted)}
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
                  <p className="mb-1.5 text-caption font-medium text-muted">Nuevo mensaje</p>
                  {team
                    .filter((t) => t.id !== user?.id && !rooms.some((r) => r.type === "DIRECT" && r.other?.id === t.id))
                    .map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => void openDirect(member.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-accent/8"
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
            <span className="grid size-16 place-items-center rounded-2xl bg-accent/12 text-accent">
              <MessageSquare size={28} />
            </span>
            <p className="text-base font-semibold text-ink">Selecciona un chat</p>
            <p className="text-sm text-muted">Elige una conversación o inicia un nuevo mensaje directo.</p>
          </div>
        ) : (
          <>
            {/* Header de conversación */}
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <div className="relative">
                {roomInfo?.type === "GROUP" ? (
                  <span className="grid size-9 place-items-center rounded-2xl bg-accent/12 text-accent">
                    <Users size={17} />
                  </span>
                ) : roomInfo ? (
                  <ProfileAvatar
                    name={otherMember?.name ?? "?"}
                    photoUrl={otherMember?.photoUrl}
                    size="sm"
                    className="size-9 rounded-2xl"
                  />
                ) : null}
                {roomInfo?.type === "DIRECT" && otherMember?.online && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[rgb(var(--color-card))] bg-ok" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{activeRoomTitle}</p>
                {activeRoomSubtitle && (
                  <p className={cn("text-xs", otherMember?.online ? "font-semibold text-green-500" : "text-muted")}>{activeRoomSubtitle}</p>
                )}
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
                  const status = computeMessageStatus(msg, otherIds);
                  const canDeleteAll = !msg.deleted && (msg.senderId === user?.id || isManager);

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
                      <div className={cn("group mb-1 flex items-end gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                        <div className="w-8 shrink-0">
                          {showAvatar && !isMe && (
                            <ProfileAvatar name={msg.senderName} photoUrl={msg.senderPhoto} size="sm" className="size-8 rounded-xl text-xs" />
                          )}
                        </div>
                        <div id={`dmsg-${msg.id}`} className={cn("flex max-w-[60%] flex-col", isMe ? "items-end" : "items-start")}>
                          {showAvatar && !isMe && roomInfo?.type === "GROUP" && (
                            <span className="mb-0.5 pl-1 text-[11px] font-bold text-muted">{msg.senderName}</span>
                          )}
                          {msg.replyTo && (
                            <ReplyQuote reply={msg.replyTo} isMe={isMe} onClick={() => scrollToMessage(msg.replyTo!.id)} />
                          )}
                          <MessageBody msg={msg} isMe={isMe} onImageClick={setLightbox} />
                          <span className={cn("mt-0.5 flex items-center gap-1 text-[10px] text-muted", isMe ? "flex-row-reverse pr-1" : "pl-1")}>
                            {msgTime(msg.createdAt)}
                            {isMe && !msg.deleted && otherIds.length > 0 && <MessageTicks status={status} />}
                          </span>
                          {!msg.deleted && (
                            <ReactionChips reactions={msg.reactions} myId={user?.id} onToggle={(e) => void reactToMessage(msg, e)} />
                          )}
                        </div>
                        {/* Acciones (hover) */}
                        {!msg.deleted && (
                          <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => setMenuMsg(msg)}
                              className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-accent/10 hover:text-ink"
                              title="Reaccionar"
                            >
                              <Smile size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }}
                              className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-accent/10 hover:text-ink"
                              title="Responder"
                            >
                              <Reply size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMenuMsg(msg)}
                              className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-accent/10 hover:text-ink"
                              title="Opciones"
                            >
                              <MoreVertical size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="relative shrink-0 border-t border-line px-5 py-3">
              <ChatPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onEmoji={(e) => { setInput((prev) => prev + e); inputRef.current?.focus(); }}
                onSticker={(sid) => { void doSend(encodeStickerMsg(sid)); }}
                onGif={(url) => { void doSend(encodeGifMsg(url)); }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }}
              />
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-2xl border-l-[3px] border-accent bg-accent/8 px-3 py-1.5">
                  <Reply size={15} className="shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-accent">Respondiendo a {replyTo.senderId === user?.id ? "ti" : replyTo.senderName}</p>
                    <p className="truncate text-[11px] text-muted">{chatPreview(replyTo.body, replyTo.deleted)}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-accent/10">
                    <X size={15} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className={cn("grid size-10 shrink-0 place-items-center rounded-2xl transition", pickerOpen ? "bg-accent/15 text-accent" : "bg-panel text-muted hover:text-ink")}
                >
                  <Smile size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl bg-panel text-muted transition hover:text-ink disabled:opacity-40"
                >
                  <ImagePlus size={18} />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onFocus={() => setPickerOpen(false)}
                  placeholder="Escribe un mensaje…"
                  rows={1}
                  maxLength={1000}
                  className="flex-1 resize-none rounded-2xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink outline-none focus:border-accent"
                  style={{ maxHeight: "120px", overflowY: "auto" }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent shadow-md transition hover:bg-accent/90 active:scale-95 disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Menú de acciones del mensaje */}
      {menuMsg && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={() => setMenuMsg(null)}>
          <div className="w-full max-w-xs desk-floating rounded-2xl p-2" onClick={(e) => e.stopPropagation()}>
            {!menuMsg.deleted && (
              <ReactionBar onPick={(e) => void reactToMessage(menuMsg, e)} />
            )}
            {!menuMsg.deleted && (
              <button
                type="button"
                onClick={() => { setReplyTo(menuMsg); setMenuMsg(null); inputRef.current?.focus(); }}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-ink transition hover:bg-accent/8"
              >
                <Reply size={18} className="text-accent" /> Responder
              </button>
            )}
            {!menuMsg.deleted && (menuMsg.senderId === user?.id || isManager) && (
              <button
                type="button"
                onClick={() => void deleteMessage(menuMsg, "all")}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-red-500 transition hover:bg-red-500/10"
              >
                <Trash2 size={18} /> Eliminar para todos
              </button>
            )}
            <button
              type="button"
              onClick={() => void deleteMessage(menuMsg, "me")}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-ink transition hover:bg-accent/8"
            >
              <Trash2 size={18} className="text-muted" /> Eliminar para mí
            </button>
            <button
              type="button"
              onClick={() => setMenuMsg(null)}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-muted transition hover:bg-accent/8"
            >
              <X size={18} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Visor de imagen a pantalla completa */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-6" onClick={() => setLightbox(null)}>
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Imagen" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
