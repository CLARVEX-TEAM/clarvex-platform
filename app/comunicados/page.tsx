"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import NextImage from "next/image";
import { ImagePlus, Megaphone, MessageCircle, X } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { ANNOUNCEMENT_REACTIONS } from "@/lib/reactions";
import type { Announcement, AnnouncementReaction, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, NotificationCard, ProfileAvatar, ProgressBar, Skeleton } from "@/components/ui";
import { AppInput, AppTextarea } from "@/components/forms";
import { SendButton, SendIconButton } from "@/components/SendButton";
import { DeleteButton } from "@/components/ActionButtons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PullToRefresh } from "@/components/PullToRefresh";
import { haptic } from "@/lib/haptics";
import { useToast } from "@/components/Toast";

type Filter = "todos" | "no-leidos" | "importantes";

export default function ComunicadosPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<User | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");

  const load = useCallback(
    () => fetchAppData()
      .then((payload) => { setData(payload); setAnnouncements(payload.announcements); })
      .catch(() => setData(null)),
    []
  );

  useEffect(() => {
    getSession().then(setSession);
    void load();
  }, [load]);

  async function toggleRead(id: string) {
    if (!session) return;
    const current = announcements.find((item) => item.id === id);
    if (!current) return;
    const previous = announcements;
    const read = !current.readBy.includes(session.id);

    setAnnouncements((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, readBy: item.readBy.includes(session.id) ? item.readBy.filter((reader) => reader !== session.id) : [...item.readBy, session.id] }
          : item
      )
    );

    try {
      const response = await fetch(`/api/announcements/${id}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) });
      if (!response.ok) throw new Error("No se pudo actualizar la lectura.");
    } catch {
      setAnnouncements(previous);
    }
  }

  async function toggleReaction(announcementId: string, emoji: string) {
    if (!session) return;
    const userId = session.id;
    const previous = announcements;

    setAnnouncements((current) =>
      current.map((item) => {
        if (item.id !== announcementId) return item;
        const has = item.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === userId);
        const reactions = has
          ? item.reactions.filter((reaction) => !(reaction.emoji === emoji && reaction.userId === userId))
          : [...item.reactions, { emoji, userId }];
        return { ...item, reactions };
      })
    );

    try {
      const response = await fetch(`/api/announcements/${announcementId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji })
      });
      if (!response.ok) throw new Error("No se pudo reaccionar.");
      const payload = await response.json() as { reactions: AnnouncementReaction[] };
      setAnnouncements((current) => current.map((item) => item.id === announcementId ? { ...item, reactions: payload.reactions } : item));
    } catch {
      setAnnouncements(previous);
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast("Solo se permiten imágenes JPG, PNG o WEBP.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("La imagen debe pesar menos de 5 MB.", "error");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setDeleting(true);
    const previous = announcements;
    setAnnouncements((prev) => prev.filter((item) => item.id !== id));
    try {
      const response = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
    } catch {
      setAnnouncements(previous);
      toast("No se pudo eliminar el comunicado.", "error");
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) { toast("Inicia sesión para publicar.", "error"); return; }
    if (!title.trim() || !body.trim()) { toast("Escribe título y mensaje.", "error"); return; }
    if (submitting) return;

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("body", body);
      if (imageFile) form.append("image", imageFile);

      const response = await fetch("/api/announcements", { method: "POST", body: form });
      if (!response.ok) throw new Error("No se pudo publicar.");
      const payload = await response.json() as { announcement: Announcement };

      setAnnouncements((current) => [payload.announcement, ...current]);
      setTitle("");
      setBody("");
      removeImage();
      toast("Comunicado publicado.", "success");
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      toast("No se pudo publicar el comunicado.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const advisors = data?.users.filter((user) => user.role === "ASESOR") ?? [];
  const visibleAnnouncements = announcements.filter((item) => {
    const unread = session ? !item.readBy.includes(session.id) : false;
    const important = /urgente|importante|critico|critica/i.test(`${item.title} ${item.body}`);
    if (filter === "no-leidos") return unread;
    if (filter === "importantes") return important;
    return true;
  });

  return (
    <>
      <AppHeader title="Comunicados" subtitle={session?.role === "ASESOR" ? "Lee avisos y confirma tu lectura." : "Publicacion, lectura y seguimiento por asesor."} backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <PullToRefresh onRefresh={load}>
      <AppFrame>
        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {[
            ["todos", "Todos"],
            ["no-leidos", "No leidos"],
            ["importantes", "Importantes"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as Filter)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black tracking-[-0.01em] transition active:scale-95 ${filter === value ? "bg-volt text-white shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!data ? <div className="mb-3 space-y-2.5"><Skeleton className="h-28 rounded-[28px]" /><Skeleton className="h-40 rounded-[28px]" /></div> : null}

        {session?.role !== "ASESOR" ? (
          <Card className="mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="text-volt" size={18} />
              <h2 className="text-lg font-black">Publicar comunicado</h2>
            </div>
            <form className="mt-3 grid gap-3" onSubmit={publishAnnouncement}>
              <AppInput
                label="Título"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <AppTextarea
                label="Mensaje para el equipo"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              {imagePreview ? (
                <div className="relative overflow-hidden rounded-2xl border border-line">
                  <NextImage src={imagePreview} alt="Vista previa" width={800} height={300} className="max-h-48 w-full object-cover" unoptimized />
                  <button type="button" onClick={removeImage} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-line bg-panel px-3 text-sm font-semibold text-muted transition hover:border-volt hover:text-volt"
                >
                  <ImagePlus size={16} />
                  Adjuntar imagen (opcional)
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
              <SendButton type="submit" loading={submitting} success={saved} sentLabel="¡Enviado!" className="w-full">
                Mandar comunicado
              </SendButton>
            </form>
          </Card>
        ) : null}

        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
          {visibleAnnouncements.map((item) => {
            const unread = session ? !item.readBy.includes(session.id) : false;
            const authorUser = data?.users.find((user) => user.id === item.authorId);
            const author = authorUser?.name ?? "Equipo";
            const readProgress = advisors.length ? Math.round((item.readBy.length / advisors.length) * 100) : 0;
            return (
              <motion.div key={item.id} layout exit={{ opacity: 0, scale: 0.9, x: 60 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
              <NotificationCard
                title={item.title}
                body={item.body}
                imageUrl={item.imageUrl}
                meta={`${item.date} por ${author}`}
                author={{ name: author, photoUrl: authorUser?.photoUrl }}
                unread={unread}
                action={
                  <>
                    {session ? (
                      <ReactionBar
                        reactions={item.reactions}
                        currentUserId={session.id}
                        onToggle={(emoji) => void toggleReaction(item.id, emoji)}
                      />
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge>{item.readBy.length}/{advisors.length}</Badge>
                      <span className="text-xs font-bold text-muted">lectura del equipo</span>
                    </div>
                    <ProgressBar value={readProgress} />
                    <div className="mt-2 grid gap-0 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                      {session?.role === "ASESOR" && session ? (
                        <button
                          onClick={() => void toggleRead(item.id)}
                          className="flex min-h-11 items-center justify-between py-2"
                        >
                          <span className="font-semibold">Mi lectura</span>
                          <Badge tone={item.readBy.includes(session.id) ? "done" : "warn"}>
                            {item.readBy.includes(session.id) ? "leido" : "marcar como leido"}
                          </Badge>
                        </button>
                      ) : null}

                      {session?.role !== "ASESOR" ? advisors.map((advisor) => {
                        const read = item.readBy.includes(advisor.id);
                        return (
                          <div
                            key={advisor.id}
                            className="flex min-h-10 items-center justify-between py-2 text-sm"
                          >
                            <span className="font-semibold">{advisor.name}</span>
                            <Badge tone={read ? "done" : "warn"}>{read ? "leido" : "pendiente"}</Badge>
                          </div>
                        );
                      }) : null}
                    </div>
                    {session ? <CommentsThread announcementId={item.id} session={session} /> : null}
                    {session?.role !== "ASESOR" ? (
                      <DeleteButton onClick={() => setPendingDeleteId(item.id)} className="mt-2 w-full">
                        Eliminar comunicado
                      </DeleteButton>
                    ) : null}
                  </>
                }
              />
              </motion.div>
            );
          })}
          </AnimatePresence>
          {visibleAnnouncements.length === 0 ? (
            <Card>
              <p className="font-black">Sin comunicados</p>
              <p className="mt-2 text-sm text-muted">Los avisos de gerencia apareceran aqui con estado de lectura.</p>
            </Card>
          ) : null}
        </div>
      </AppFrame>
      </PullToRefresh>
      <BottomNav />
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar comunicado?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

type CommentItem = { id: string; body: string; authorId: string; author: { name: string; photoUrl: string | null }; createdAt: string };

function CommentsThread({ announcementId, session }: { announcementId: string; session: User }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const payload = await fetch(`/api/comments?announcementId=${announcementId}`, { cache: "no-store" }).then((response) => response.json() as Promise<{ comments?: CommentItem[] }>);
      setComments(payload.comments ?? []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && comments === null) void load();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId, body: text })
      });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { comment: CommentItem };
      setComments((current) => [...(current ?? []), payload.comment]);
      setBody("");
    } catch {
      // Silencioso: el campo conserva el texto para reintentar.
    } finally {
      setSending(false);
    }
  }

  const count = comments?.length ?? 0;

  return (
    <div className="mt-2 border-t border-white/[0.07] pt-2">
      <button onClick={toggle} className="flex min-h-10 w-full items-center justify-between py-1">
        <span className="flex items-center gap-2 text-sm font-bold text-ink"><MessageCircle size={15} className="text-volt" />Comentarios{count > 0 ? ` (${count})` : ""}</span>
        <span className="text-xs font-bold text-muted">{open ? "Ocultar" : "Ver"}</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-2.5">
          {loading ? (
            <p className="py-2 text-sm text-muted">Cargando…</p>
          ) : count === 0 ? (
            <p className="py-1 text-sm text-muted">Sé el primero en comentar.</p>
          ) : (
            comments!.map((comment) => (
              <div key={comment.id} className="flex items-start gap-2.5">
                <ProfileAvatar name={comment.author.name} photoUrl={comment.author.photoUrl} size="sm" />
                <div className="min-w-0 flex-1 rounded-2xl bg-panel px-3 py-2">
                  <p className="text-xs font-black text-ink">{comment.author.name}{comment.authorId === session.id ? " · tú" : ""}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{comment.body}</p>
                </div>
              </div>
            ))
          )}
          <form onSubmit={submit} className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1000}
              rows={1}
              placeholder="Escribe un comentario…"
              className="min-h-11 flex-1 resize-none rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
            />
            <SendIconButton type="submit" loading={sending} disabled={sending || !body.trim()} aria-label="Enviar comentario" />
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ReactionBar({ reactions, currentUserId, onToggle }: { reactions: AnnouncementReaction[]; currentUserId: string; onToggle: (emoji: string) => void }) {
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const reaction of reactions) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    if (reaction.userId === currentUserId) mine.add(reaction.emoji);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {ANNOUNCEMENT_REACTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const reacted = mine.has(emoji);
        return (
          <motion.button
            key={emoji}
            type="button"
            whileTap={{ scale: 0.85 }}
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            onClick={() => { haptic("light"); onToggle(emoji); }}
            aria-pressed={reacted}
            className={`flex min-h-9 items-center gap-1 rounded-full px-2.5 text-sm ${reacted ? "bg-volt/15 ring-1 ring-volt/40" : "bg-panel ring-1 ring-line hover:ring-volt/30"}`}
          >
            <motion.span
              className="leading-none"
              animate={reacted ? { scale: [1, 1.5, 1], rotate: [0, -14, 0] } : { scale: 1 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              {emoji}
            </motion.span>
            <AnimatePresence mode="popLayout">
              {count > 0 ? (
                <motion.span
                  key={count}
                  initial={{ y: 9, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -9, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={`text-xs font-black ${reacted ? "text-volt" : "text-muted"}`}
                >
                  {count}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
