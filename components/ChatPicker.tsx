"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Catálogo de stickers ─────────────────────────────────────────────────────

export type Sticker = {
  id: string;
  emoji: string;
  label: string;
  bg: string;
};

export const STICKERS: Sticker[] = [
  { id: "fire",       emoji: "🔥",  label: "¡En racha!",         bg: "from-orange-500/20 to-red-500/20" },
  { id: "muscle",     emoji: "💪",  label: "¡Así se hace!",      bg: "from-blue-500/20 to-indigo-500/20" },
  { id: "target",     emoji: "🎯",  label: "¡Meta cumplida!",    bg: "from-green-500/20 to-emerald-500/20" },
  { id: "clap",       emoji: "👏",  label: "¡Excelente!",        bg: "from-yellow-500/20 to-amber-500/20" },
  { id: "rocket",     emoji: "🚀",  label: "¡A todo vapor!",     bg: "from-purple-500/20 to-violet-500/20" },
  { id: "star",       emoji: "⭐",  label: "¡Brillaste!",        bg: "from-yellow-400/20 to-orange-400/20" },
  { id: "trophy",     emoji: "🏆",  label: "¡Campeón!",          bg: "from-amber-500/20 to-yellow-500/20" },
  { id: "hundred",    emoji: "💯",  label: "¡Al 100%!",          bg: "from-green-400/20 to-teal-400/20" },
  { id: "sparkles",   emoji: "✨",  label: "¡Magia!",            bg: "from-pink-400/20 to-rose-400/20" },
  { id: "handshake",  emoji: "🤝",  label: "¡Equipo!",           bg: "from-blue-400/20 to-cyan-400/20" },
  { id: "tada",       emoji: "🎉",  label: "¡Lo logramos!",      bg: "from-pink-500/20 to-purple-500/20" },
  { id: "lightning",  emoji: "⚡",  label: "¡Energía total!",    bg: "from-yellow-400/20 to-lime-400/20" },
  { id: "chart",      emoji: "📈",  label: "¡Arriba!",           bg: "from-green-500/20 to-emerald-500/20" },
  { id: "coffee",     emoji: "☕",  label: "Bien merecido",       bg: "from-amber-700/20 to-orange-700/20" },
  { id: "eyes",       emoji: "👀",  label: "¡Ojo al tiro!",      bg: "from-slate-400/20 to-gray-400/20" },
  { id: "sunglasses", emoji: "😎",  label: "¡Lo tienes!",        bg: "from-blue-400/20 to-sky-400/20" },
  { id: "party",      emoji: "🥳",  label: "¡A celebrar!",       bg: "from-pink-400/20 to-fuchsia-400/20" },
  { id: "gem",        emoji: "💎",  label: "¡De lujo!",          bg: "from-cyan-400/20 to-blue-400/20" },
  { id: "check",      emoji: "✅",  label: "¡Listo!",            bg: "from-green-400/20 to-emerald-400/20" },
  { id: "heart",      emoji: "❤️", label: "Con todo el corazón", bg: "from-red-400/20 to-rose-400/20" },
];

// ─── Emojis por categoría ─────────────────────────────────────────────────────

const EMOJI_CATS: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: "Recientes",
    icon: "🕐",
    emojis: [] // se rellena dinámicamente con localStorage
  },
  {
    label: "Caras",
    icon: "😊",
    emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🥺","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤧","🥵","🥶","😵","🤯","🤠","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","☹️","😮","😯","😲","😳","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","🤬","😈","👿","💀","☠️"]
  },
  {
    label: "Gestos",
    icon: "👍",
    emojis: ["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👁","👀","👅","👄","💋"]
  },
  {
    label: "Personas",
    icon: "🧑",
    emojis: ["🧑","👶","🧒","👦","👧","🧑","👱","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷","👮","🕵","💂","🧑‍⚕️","👩‍⚕️","🧑‍🌾","👩‍🌾","🧑‍🍳","👩‍🍳","🧑‍🏫","👩‍🏫","🧑‍🏭","👩‍🏭","💼","🧑‍💻","👩‍💻","🎤","🎧","🎨","✈️"]
  },
  {
    label: "Naturaleza",
    icon: "🌿",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🦋","🐛","🐌","🐞","🦗","🦟","🌸","🌹","🌺","🌻","🌼","🌷","🌲","🌴","🌵","🌾","🍀","🍁","🍂","🍃","🌿","☘️","🎋","🎍","🌱","🌿","🍄","🐚","🌊","🌈","🔥","⭐","🌙","☀️","⛄","🌩","🌧","🌪"]
  },
  {
    label: "Comida",
    icon: "🍕",
    emojis: ["🍎","🍊","🍋","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🍆","🥦","🥬","🌽","🥕","🧅","🥔","🍠","🥜","🍞","🥐","🥨","🧀","🍳","🥚","🍗","🍖","🥩","🥓","🍔","🍟","🌮","🌯","🫔","🥙","🥗","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🍤","🍙","🍚","🍘","🍥","🥮","🍡","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","☕","🧃","🥤","🧋","🍺","🍷","🥂","🍾"]
  },
  {
    label: "Objetos",
    icon: "🎁",
    emojis: ["⚽","🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸","🥊","🥅","⛳","🎣","🏹","🎽","🛹","🛼","🛷","⛸","🥋","🤸","🎯","🎱","🎮","🕹️","🎲","♟️","🧩","🎭","🎨","🎬","🎤","🎧","🎼","🎵","🎶","🎷","🎸","🎹","🥁","🎺","🎻","🪕","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","💾","💿","📸","📷","📹","📺","📻","🎙️","📞","☎️","📟","📠","🔋","🔌","💡","🔦","🕯️","💰","💳","🪙","💎","⚙️","🔧","🔨","⛏️","🛠️","🔩","🧲","🗝️","🔑","🚪","🪑","🛋️","🛏️","🚿","🛁","🪥","🧸","🎀","🎁","🎊","🎉","🧨","✨","🎈","🎇","🧧","🎐","🎑","🎃","🎄","🎋","🎍"]
  },
  {
    label: "Símbolos",
    icon: "❤️",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☯️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔷","🔶","🔸","🔹","🔲","🔳","▪️","▫️","◾","◽","◼️","◻️","🔉","🔊","📢","📣","🔔","🔕","🎵","🎶","💬","💭","🗯️","💤","🔱","⚜️","✅","❎","🆗","🆙","🆒","🆕","🆓","🔝","🅱️","🆎","🆑","🅰️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🌀","🔃","🔄","🔙","🔚","🔛","🔜","🔝","⚠️","🚸","🔰","🆚","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲"]
  }
];

// ─── Helpers para serializar/deserializar mensajes especiales ─────────────────

export function encodeStickerMsg(id: string) {
  return `[sticker:${id}]`;
}

export function encodeGifMsg(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    if (host !== "klipy.com" && !host.endsWith(".klipy.com")) return "";
  } catch {
    return "";
  }
  return `[gif:${url}]`;
}

export function encodeImageMsg(url: string) {
  // Solo el proxy autenticado; no se aceptan https externos en mensajes nuevos.
  if (!url.startsWith("/api/chat/file?k=")) return "";
  return `[img:${url}]`;
}

export function decodeImageMsg(body: string): string | null {
  // Proxy actual; https históricos se muestran solo si el guard del API los rechazó al escribir.
  const proxy = /^\[img:(\/api\/chat\/file\?k=[^\]]+)\]$/.exec(body);
  if (proxy) return proxy[1];
  const legacy = /^\[img:(https:\/\/[^\]]+)\]$/.exec(body);
  return legacy ? legacy[1] : null;
}

export function decodeStickerMsg(body: string): Sticker | null {
  const m = /^\[sticker:([a-z_]+)\]$/.exec(body);
  if (!m) return null;
  return STICKERS.find((s) => s.id === m[1]) ?? null;
}

export function decodeGifMsg(body: string): string | null {
  const m = /^\[gif:(https:\/\/[^\]]+)\]$/.exec(body);
  if (!m) return null;
  try {
    const host = new URL(m[1]).hostname.toLowerCase();
    if (host !== "klipy.com" && !host.endsWith(".klipy.com")) return null;
  } catch {
    return null;
  }
  return m[1];
}

// Texto corto para mostrar en la lista de chats (último mensaje).
export function chatPreview(body: string, deleted: boolean): string {
  if (deleted) return "🚫 Mensaje eliminado";
  if (decodeImageMsg(body)) return "📷 Foto";
  if (decodeGifMsg(body)) return "🎞️ GIF";
  const sticker = decodeStickerMsg(body);
  if (sticker) return `${sticker.emoji} Sticker`;
  return body;
}

export function isBigEmoji(body: string): boolean {
  const stripped = body.replace(/\s/g, "");
  // Mensaje que no contiene caracteres ASCII imprimibles → probablemente solo emojis
  if (/[a-zA-Z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(stripped)) return false;
  const segments = Array.from(new Intl.Segmenter().segment(stripped));
  return segments.length >= 1 && segments.length <= 3;
}

// ─── Estado de mensaje (enviado / entregado / visto) ──────────────────────────

export type MsgStatus = "sent" | "delivered" | "read";

// otherIds = ids de los demás miembros del room (todos menos yo).
// En grupo se considera "visto" solo cuando todos los demás lo leyeron.
export function computeMessageStatus(
  msg: { readBy: string[]; deliveredTo: string[] },
  otherIds: string[]
): MsgStatus {
  if (otherIds.length === 0) return "sent";
  if (otherIds.every((id) => msg.readBy.includes(id))) return "read";
  if (otherIds.every((id) => msg.deliveredTo.includes(id))) return "delivered";
  return "sent";
}

export function MessageTicks({ status, className }: { status: MsgStatus; className?: string }) {
  if (status === "sent") return <Check size={13} className={cn("text-muted", className)} />;
  if (status === "delivered") return <CheckCheck size={13} className={cn("text-muted", className)} />;
  return <CheckCheck size={13} className={cn("text-sky-500", className)} />;
}

// ─── Reacciones ───────────────────────────────────────────────────────────────

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export type MessageReaction = { userId: string; emoji: string };
export type GroupedReaction = { emoji: string; count: number; mine: boolean };

export function groupReactions(reactions: MessageReaction[], myId: string | undefined): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>();
  for (const r of reactions) {
    const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === myId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map.values());
}

export function ReactionBar({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="flex items-center justify-around gap-1 px-1 py-1.5">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="grid size-10 place-items-center rounded-full text-2xl transition hover:bg-volt/10 active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function ReactionChips({ reactions, myId, onToggle }: {
  reactions: MessageReaction[];
  myId: string | undefined;
  onToggle: (emoji: string) => void;
}) {
  const grouped = groupReactions(reactions, myId);
  if (grouped.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {grouped.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => onToggle(g.emoji)}
          className={cn(
            "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[12px] leading-none transition",
            g.mine ? "border-volt bg-volt/15" : "border-line bg-panel"
          )}
        >
          <span>{g.emoji}</span>
          {g.count > 1 && <span className="text-[10px] font-bold text-muted">{g.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Cita de respuesta ────────────────────────────────────────────────────────

export type ReplyInfo = { id: string; senderName: string; preview: string; deleted: boolean };

export function ReplyQuote({ reply, isMe, onClick }: { reply: ReplyInfo; isMe: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-0.5 flex w-full flex-col overflow-hidden rounded-xl border-l-[3px] px-2.5 py-1 text-left",
        isMe ? "border-white/60 bg-white/15" : "border-volt bg-volt/10"
      )}
    >
      <span className={cn("text-[11px] font-bold leading-tight", isMe ? "text-white" : "text-volt")}>{reply.senderName}</span>
      <span className={cn("truncate text-[11px] leading-tight", isMe ? "text-white/85" : "text-muted")}>{reply.preview}</span>
    </button>
  );
}

// ─── Presencia (en línea / última vez) ────────────────────────────────────────

export function formatLastSeen(lastSeenAt: string | null, online: boolean): string {
  if (online) return "en línea";
  if (!lastSeenAt) return "";
  const d = new Date(lastSeenAt);
  const now = new Date();
  const time = d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `últ. vez hoy ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `últ. vez ayer ${time}`;
  return `últ. vez ${d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

type Tab = "emoji" | "sticker" | "gif";

type GifResult = { id: string; url: string; previewUrl: string; title: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onEmoji: (emoji: string) => void;
  onSticker: (stickerId: string) => void;
  onGif: (url: string) => void;
};

export function ChatPicker({ open, onClose, onEmoji, onSticker, onGif }: Props) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [emojiCat, setEmojiCat] = useState(1); // 0 = recientes
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar emojis recientes de localStorage
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("clarvex_recent_emojis") ?? "[]") as string[];
      setRecentEmojis(stored);
      EMOJI_CATS[0].emojis = stored;
    } catch { /* nada */ }
  }, [open]);

  // Buscar GIFs con debounce
  useEffect(() => {
    if (tab !== "gif") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!gifQuery.trim()) {
      void searchGifs("equipo trabajo");
      return;
    }
    debounceRef.current = setTimeout(() => { void searchGifs(gifQuery); }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gifQuery, tab]);

  async function searchGifs(q: string) {
    setGifLoading(true);
    setGifError("");
    try {
      const res = await fetch(`/api/chat/gifs?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setGifError(d.error ?? "Error buscando GIFs");
        return;
      }
      const d = await res.json() as { gifs: GifResult[] };
      setGifs(d.gifs ?? []);
    } catch {
      setGifError("No se pudo conectar.");
    } finally {
      setGifLoading(false);
    }
  }

  function handleEmoji(emoji: string) {
    // Guardar en recientes
    const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 24);
    setRecentEmojis(updated);
    EMOJI_CATS[0].emojis = updated;
    localStorage.setItem("clarvex_recent_emojis", JSON.stringify(updated));
    onEmoji(emoji);
  }

  if (!open) return null;

  const currentCat = EMOJI_CATS[emojiCat];
  const displayEmojis = emojiCat === 0 ? recentEmojis : currentCat.emojis;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 flex flex-col overflow-hidden rounded-3xl border border-line bg-white/95 shadow-2xl backdrop-blur-xl dark:bg-[#0f1729]/97" style={{ height: "320px" }}>
        {/* Tabs */}
        <div className="flex shrink-0 border-b border-line">
          {(["emoji", "sticker", "gif"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); if (t === "gif" && searchRef.current) setTimeout(() => searchRef.current?.focus(), 50); }}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors",
                tab === t ? "border-b-2 border-volt text-volt" : "text-muted"
              )}
            >
              {t === "emoji" ? "😊 Emoji" : t === "sticker" ? "🎨 Stickers" : "GIF"}
            </button>
          ))}
        </div>

        {/* ── Emoji tab ── */}
        {tab === "emoji" && (
          <div className="flex flex-1 overflow-hidden">
            {/* Categorías */}
            <div className="flex w-10 shrink-0 flex-col overflow-y-auto border-r border-line py-1">
              {EMOJI_CATS.map((cat, i) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setEmojiCat(i)}
                  title={cat.label}
                  className={cn(
                    "grid h-9 place-items-center text-base transition-colors",
                    emojiCat === i ? "bg-volt/12 text-volt" : "text-muted hover:text-ink"
                  )}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-1.5">
              {emojiCat === 0 && recentEmojis.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted">Todavía no hay emojis recientes.</p>
              ) : (
                <div className="grid grid-cols-8 gap-0.5">
                  {displayEmojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      onClick={() => handleEmoji(emoji)}
                      className="grid h-9 place-items-center rounded-xl text-xl transition-colors hover:bg-volt/10 active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Sticker tab ── */}
        {tab === "sticker" && (
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-4 gap-2">
              {STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onSticker(s.id); onClose(); }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-br p-2.5 transition active:scale-95",
                    s.bg
                  )}
                >
                  <span className="text-3xl leading-none">{s.emoji}</span>
                  <span className="line-clamp-2 text-center text-[10px] font-bold leading-tight text-ink">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── GIF tab ── */}
        {tab === "gif" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-line px-3 py-2">
              <input
                ref={searchRef}
                type="text"
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="Buscar GIFs…"
                className="w-full rounded-2xl border border-line bg-panel px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-volt"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {gifLoading ? (
                <p className="py-4 text-center text-xs text-muted">Buscando…</p>
              ) : gifError ? (
                <p className="py-4 text-center text-xs text-muted">{gifError}</p>
              ) : gifs.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">Sin resultados.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {gifs.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => { onGif(gif.url); onClose(); }}
                      className="overflow-hidden rounded-xl transition active:scale-95"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={gif.previewUrl} alt={gif.title} className="h-20 w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
