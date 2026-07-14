"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Smile, Users, ImagePlus, Trash2, X, Reply } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppHeader, ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
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
  postChatImage,
  postChatMessage,
  postChatReaction,
  type ChatMessageView as Message,
  type ChatRoomInfoView as RoomInfo
} from "@/lib/chat-client";

function MessageBody({ msg, isMe, onImageClick }: { msg: Message; isMe: boolean; onImageClick?: (url: string) => void }) {
  if (msg.deleted) {
    return (
      <div className={cn(
        "flex items-center gap-1.5 rounded-2xl border border-dashed px-3.5 py-2 text-sm italic",
        isMe ? "border-white/40 text-white/80" : "border-line text-muted"
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
        <span className="text-xs font-black text-ink">{sticker.label}</span>
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
        className="max-h-64 max-w-[220px] cursor-pointer rounded-2xl object-cover"
        loading="lazy"
        onClick={() => onImageClick?.(imgUrl)}
      />
    );
  }

  const gifUrl = decodeGifMsg(msg.body);
  if (gifUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={gifUrl} alt="GIF" className="max-w-[200px] rounded-2xl" loading="lazy" />
    );
  }

  if (isBigEmoji(msg.body)) {
    return <span className="text-5xl leading-none">{msg.body}</span>;
  }

  return (
    <div
      className={cn(
        "rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
        isMe
          ? "rounded-br-sm bg-volt text-white"
          : "rounded-bl-sm bg-white/90 text-ink dark:bg-white/10"
      )}
    >
      {msg.body}
    </div>
  );
}

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<User | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipe = useRef<{ x: number; y: number; el: HTMLElement; moved: number } | null>(null);

  useEffect(() => {
    getSession().then((s) => { if (!s) router.replace("/login"); else setSession(s); });
  }, [router]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetchChatRoom(id);
      setMessages(res.messages);
      if (res.room) setRoom(res.room);
    } catch {
      // Este sondeo corre cada 3 s en un móvil: perder una petición por señal
      // intermitente, cambio de red o app en segundo plano es lo NORMAL, no una
      // excepción. Se ignora y se reintenta en el siguiente ciclo.
      //
      // Antes se propagaba sin capturar y Sentry lo reportaba como
      // "TypeError: Failed to fetch" (unhandled) una y otra vez.
    }
  }, [id]);

  useEffect(() => {
    if (!session) return;
    fetchMessages().finally(() => setLoading(false));
  }, [session, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => { void fetchMessages(); }, 3000);
    return () => clearInterval(interval);
  }, [session, fetchMessages]);

  async function doSend(body: string) {
    if (!body.trim() || sending) return;
    setSending(true);
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      const message = await postChatMessage(id, body, replyToId);
      setMessages((prev) => [...prev, message]);
    } catch {
      // Se devuelve el texto al campo: perder lo que acababas de escribir por un
      // bache de señal sería peor que el propio fallo.
      setInput(body);
      if (replyToId) setReplyTo((prev) => prev ?? null);
      toast("No se pudo enviar. Revisa tu conexión.", "error");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function uploadImage(file: File) {
    if (sending) return;
    if (!file.type.startsWith("image/")) return;
    setSending(true);
    setPickerOpen(false);
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      const res = await postChatImage(id, file, replyToId);
      if (res.message) setMessages((prev) => [...prev, res.message!]);
      else if (res.error) toast(res.error, "error");
    } catch {
      toast("No se pudo enviar la imagen. Revisa tu conexión.", "error");
    } finally {
      setSending(false);
    }
  }

  async function reactToMessage(msg: Message, emoji: string) {
    setMenuMsg(null);
    try {
      const reactions = await postChatReaction(id, msg.id, emoji);
      if (reactions) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions } : m)));
      }
    } catch {
      // Una reacción es cosmética: si falla, el sondeo la resincroniza sola. No
      // vale la pena molestar al usuario, pero sí evitar el unhandled rejection.
    }
  }

  function scrollToMessage(messageId: string) {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-volt", "rounded-2xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-volt", "rounded-2xl"), 1200);
    }
  }

  // Deslizar a la derecha sobre un mensaje para responderlo (estilo WhatsApp).
  function onSwipeStart(e: React.TouchEvent, el: HTMLElement) {
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, el, moved: 0 };
  }
  function onSwipeMove(e: React.TouchEvent) {
    if (!swipe.current) return;
    const dx = e.touches[0].clientX - swipe.current.x;
    const dy = e.touches[0].clientY - swipe.current.y;
    if (dx > 8 && dx > Math.abs(dy)) {
      cancelPress();
      const clamped = Math.min(dx, 72);
      swipe.current.moved = clamped;
      swipe.current.el.style.transform = `translateX(${clamped}px)`;
    }
  }
  function onSwipeEnd(msg: Message) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    s.el.style.transition = "transform 0.15s ease-out";
    s.el.style.transform = "";
    window.setTimeout(() => { s.el.style.transition = ""; }, 160);
    if (s.moved > 48 && !msg.deleted) {
      setReplyTo(msg);
      inputRef.current?.focus();
    }
  }

  async function deleteMessage(msg: Message, scope: "me" | "all") {
    setMenuMsg(null);
    await deleteChatMessage(id, msg.id, scope);
    if (scope === "me") {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, deleted: true, body: "" } : m)));
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); void uploadImage(file); }
  }

  function startPress(msg: Message) {
    cancelPress();
    pressTimer.current = setTimeout(() => setMenuMsg(msg), 450);
  }
  function cancelPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  function handleSend() { const t = input.trim(); setInput(""); void doSend(t); }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const isManager = session?.role === "GERENTE" || session?.role === "SUBGERENTE";
  const otherMember = room?.members.find((m) => m.id !== session?.id) ?? null;
  const otherIds = room ? room.members.filter((m) => m.id !== session?.id).map((m) => m.id) : [];

  const title = room
    ? room.type === "GROUP"
      ? (room.name ?? "Todos")
      : otherMember?.name ?? "Chat"
    : "Chat";

  const subtitle = room?.type === "GROUP"
    ? `${room.members.length} integrantes`
    : otherMember
      ? (formatLastSeen(otherMember.lastSeenAt, otherMember.online) || otherMember.role.toLowerCase())
      : "";

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  }

  function sameDay(a: string, b: string) { return a.slice(0, 10) === b.slice(0, 10); }

  function dayLabel(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white dark:bg-[#0f1729]">
      <AppHeader
        title={title}
        subtitle={subtitle}
        backHref="/chat"
        action={
          room?.type === "GROUP" ? (
            <span className="grid size-9 place-items-center rounded-2xl bg-volt/12 text-volt">
              <Users size={17} />
            </span>
          ) : otherMember ? (
            <div className="relative">
              <ProfileAvatar name={otherMember.name} photoUrl={otherMember.photoUrl} size="sm" />
              {otherMember.online && (
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-green-500 dark:border-[#0f1729]" />
              )}
            </div>
          ) : null
        }
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 pt-3">
        {loading ? (
          <p className="py-8 text-center text-sm font-semibold text-muted">Cargando mensajes…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Sé el primero en escribir 👋</p>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.senderId === session?.id;
            const showDay = i === 0 || !sameDay(messages[i - 1].createdAt, msg.createdAt);
            const showAvatar = !isMe && (i === 0 || messages[i - 1].senderId !== msg.senderId || showDay);
            const status = computeMessageStatus(msg, otherIds);

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
                  {!isMe && (
                    <div className="w-7 shrink-0">
                      {showAvatar && (
                        <ProfileAvatar name={msg.senderName} photoUrl={msg.senderPhoto} size="sm" className="size-7 rounded-xl text-xs" />
                      )}
                    </div>
                  )}
                  <div className={cn("flex max-w-[72%] flex-col", isMe ? "items-end" : "items-start")}>
                    {showAvatar && !isMe && room?.type === "GROUP" && (
                      <span className="mb-0.5 pl-1 text-[11px] font-bold text-muted">{msg.senderName}</span>
                    )}
                    <div
                      id={`msg-${msg.id}`}
                      onPointerDown={() => startPress(msg)}
                      onPointerUp={cancelPress}
                      onPointerLeave={cancelPress}
                      onPointerMove={cancelPress}
                      onContextMenu={(e) => { e.preventDefault(); setMenuMsg(msg); }}
                      onTouchStart={(e) => onSwipeStart(e, e.currentTarget)}
                      onTouchMove={onSwipeMove}
                      onTouchEnd={() => onSwipeEnd(msg)}
                      className="flex select-none flex-col"
                    >
                      {msg.replyTo && (
                        <ReplyQuote reply={msg.replyTo} isMe={isMe} onClick={() => scrollToMessage(msg.replyTo!.id)} />
                      )}
                      <MessageBody msg={msg} isMe={isMe} onImageClick={setLightbox} />
                    </div>
                    <span className={cn("mt-0.5 flex items-center gap-1 text-[10px] text-muted", isMe ? "flex-row-reverse pr-1" : "pl-1")}>
                      {formatTime(msg.createdAt)}
                      {isMe && !msg.deleted && otherIds.length > 0 && <MessageTicks status={status} />}
                    </span>
                    {!msg.deleted && (
                      <ReactionChips reactions={msg.reactions} myId={session?.id} onToggle={(e) => void reactToMessage(msg, e)} />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="relative shrink-0 border-t border-line/60 bg-white/90 px-3 pt-3 backdrop-blur-xl dark:bg-[#0f1729]/90"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/* Picker */}
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
          <div className="mx-auto mb-2 flex max-w-md items-center gap-2 rounded-2xl border-l-[3px] border-volt bg-volt/8 px-3 py-1.5">
            <Reply size={15} className="shrink-0 text-volt" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-volt">Respondiendo a {replyTo.senderId === session?.id ? "ti" : replyTo.senderName}</p>
              <p className="truncate text-[11px] text-muted">{chatPreview(replyTo.body, replyTo.deleted)}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} className="grid size-7 shrink-0 place-items-center rounded-full text-muted active:bg-volt/10">
              <X size={15} />
            </button>
          </div>
        )}
        <div className="mx-auto flex max-w-md items-end gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-2xl transition active:scale-95",
              pickerOpen ? "bg-volt/15 text-volt" : "bg-panel text-muted"
            )}
          >
            <Smile size={20} />
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-panel text-muted transition active:scale-95 disabled:opacity-40"
          >
            <ImagePlus size={20} />
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
            className="flex-1 resize-none rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-volt text-white shadow-md transition active:scale-95 disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </div>
      </div>

      {/* Menú de acciones del mensaje */}
      {menuMsg && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={() => setMenuMsg(null)}>
          <div
            className="w-full rounded-t-3xl bg-white p-2 pb-6 shadow-2xl dark:bg-[#0f1729]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-line" />
            {!menuMsg.deleted && (
              <ReactionBar onPick={(e) => void reactToMessage(menuMsg, e)} />
            )}
            {!menuMsg.deleted && (
              <button
                type="button"
                onClick={() => { setReplyTo(menuMsg); setMenuMsg(null); inputRef.current?.focus(); }}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-ink transition active:bg-volt/8"
              >
                <Reply size={18} className="text-volt" /> Responder
              </button>
            )}
            {!menuMsg.deleted && (menuMsg.senderId === session?.id || isManager) && (
              <button
                type="button"
                onClick={() => void deleteMessage(menuMsg, "all")}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-red-500 transition active:bg-red-500/10"
              >
                <Trash2 size={18} /> Eliminar para todos
              </button>
            )}
            <button
              type="button"
              onClick={() => void deleteMessage(menuMsg, "me")}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-ink transition active:bg-volt/8"
            >
              <Trash2 size={18} className="text-muted" /> Eliminar para mí
            </button>
            <button
              type="button"
              onClick={() => setMenuMsg(null)}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-muted transition active:bg-volt/8"
            >
              <X size={18} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Visor de imagen a pantalla completa */}
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4" onClick={() => setLightbox(null)}>
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/15 text-white"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
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
