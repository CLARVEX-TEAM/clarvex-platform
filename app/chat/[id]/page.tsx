"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Smile, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppHeader, ProfileAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ChatPicker,
  STICKERS,
  decodeStickerMsg,
  decodeGifMsg,
  isBigEmoji,
  encodeStickerMsg,
  encodeGifMsg
} from "@/components/ChatPicker";

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

function MessageBody({ body, isMe }: { body: string; isMe: boolean }) {
  const sticker = decodeStickerMsg(body);
  if (sticker) {
    return (
      <div className={cn("flex flex-col items-center gap-1 rounded-3xl bg-gradient-to-br p-4", sticker.bg)}>
        <span className="text-5xl leading-none">{sticker.emoji}</span>
        <span className="text-xs font-black text-ink">{sticker.label}</span>
      </div>
    );
  }

  const gifUrl = decodeGifMsg(body);
  if (gifUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={gifUrl} alt="GIF" className="max-w-[200px] rounded-2xl" loading="lazy" />
    );
  }

  if (isBigEmoji(body)) {
    return <span className="text-5xl leading-none">{body}</span>;
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
      {body}
    </div>
  );
}

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getSession().then((s) => { if (!s) router.replace("/login"); else setSession(s); });
  }, [router]);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/chat/${id}`, { cache: "no-store" }).then(
      (r) => r.json() as Promise<{ messages: Message[]; room: RoomInfo | null }>
    );
    setMessages(res.messages);
    if (res.room) setRoom(res.room);
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
    try {
      const res = await fetch(`/api/chat/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      }).then((r) => r.json() as Promise<{ message: Message }>);
      setMessages((prev) => [...prev, res.message]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSend() { const t = input.trim(); setInput(""); void doSend(t); }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const title = room
    ? room.type === "GROUP"
      ? (room.name ?? "Todos")
      : room.members.find((m) => m.id !== session?.id)?.name ?? "Chat"
    : "Chat";

  const subtitle = room?.type === "GROUP"
    ? `${room.members.length} integrantes`
    : room?.members.find((m) => m.id !== session?.id)?.role?.toLowerCase() ?? "";

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

  function isSpecialMsg(body: string) {
    return decodeStickerMsg(body) !== null || decodeGifMsg(body) !== null || isBigEmoji(body);
  }

  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-[#0f1729]">
      <AppHeader
        title={title}
        subtitle={subtitle}
        backHref="/chat"
        action={
          room?.type === "GROUP" ? (
            <span className="grid size-9 place-items-center rounded-2xl bg-volt/12 text-volt">
              <Users size={17} />
            </span>
          ) : room ? (
            <ProfileAvatar
              name={room.members.find((m) => m.id !== session?.id)?.name ?? "?"}
              photoUrl={room.members.find((m) => m.id !== session?.id)?.photoUrl}
              size="sm"
            />
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
            const special = isSpecialMsg(msg.body);

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
                  <div className={cn("max-w-[72%]", isMe ? "items-end" : "items-start", "flex flex-col")}>
                    {showAvatar && !isMe && room?.type === "GROUP" && (
                      <span className="mb-0.5 pl-1 text-[11px] font-bold text-muted">{msg.senderName}</span>
                    )}
                    <MessageBody body={msg.body} isMe={isMe} />
                    {!special && (
                      <span className={cn("mt-0.5 text-[10px] text-muted", isMe ? "pr-1 text-right" : "pl-1")}>
                        {formatTime(msg.createdAt)}
                      </span>
                    )}
                    {special && (
                      <span className={cn("mt-0.5 text-[10px] text-muted", isMe ? "pr-1 text-right" : "pl-1")}>
                        {formatTime(msg.createdAt)}
                      </span>
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
      <div className="relative shrink-0 border-t border-line/60 bg-white/90 px-3 py-3 backdrop-blur-xl dark:bg-[#0f1729]/90">
        {/* Picker */}
        <ChatPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onEmoji={(e) => { setInput((prev) => prev + e); inputRef.current?.focus(); }}
          onSticker={(id) => { void doSend(encodeStickerMsg(id)); }}
          onGif={(url) => { void doSend(encodeGifMsg(url)); }}
        />
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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
    </div>
  );
}
