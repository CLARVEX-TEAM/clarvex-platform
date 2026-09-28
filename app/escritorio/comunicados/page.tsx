"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ImagePlus, Megaphone, Search, Sparkles, Trash2, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { Announcement, User } from "@/lib/types";
import { Badge, ProfileAvatar } from "@/components/ui";
import { AppInput, AppTextarea } from "@/components/forms";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";
import {
  DeskButton, DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";
import { ShineBorder } from "@/components/magic/ShineBorder";

export default function EscritorioComunicados() {
  const { data, error, reload } = useDesktopData();
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generatingAnnouncement, setGeneratingAnnouncement] = useState(false);
  const [announcementPrompt, setAnnouncementPrompt] = useState("");
  const [showAnnouncementPrompt, setShowAnnouncementPrompt] = useState(false);

  async function handleGenerateAnnouncement() {
    if (!announcementPrompt.trim()) return;
    setGeneratingAnnouncement(true);
    try {
      const response = await fetch("/api/ai/announcements-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: announcementPrompt })
      });
      const payload = await response.json() as { title?: string; body?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo generar el comunicado.");
      setTitle(payload.title ?? "");
      setBody(payload.body ?? "");
      setShowAnnouncementPrompt(false);
      setAnnouncementPrompt("");
      toast("Borrador generado. Revísalo antes de publicar.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al generar el comunicado con IA.", "error");
    } finally {
      setGeneratingAnnouncement(false);
    }
  }

  useEffect(() => { if (data) setAnnouncements(data.announcements); }, [data]);

  const term = query.trim().toLowerCase();
  const filtered = term ? announcements.filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(term)) : announcements;

  useUnsavedGuard(Boolean(title.trim() || body.trim() || imageFile));

  const [session, setSession] = useState<User | null>(null);
  useEffect(() => { void getSession().then(setSession); }, []);

  /**
   * Confirmar la propia lectura. Gerencia también la necesita: el panel les
   * avisa de "comunicados sin confirmar lectura" y hasta ahora no había forma
   * de confirmarla desde aquí.
   */
  async function toggleOwnRead(id: string) {
    if (!session) return;
    const item = announcements.find((a) => a.id === id);
    if (!item) return;
    const read = !item.readBy.includes(session.id);
    setAnnouncements((current) => current.map((a) => a.id === id
      ? { ...a, readBy: read ? [...a.readBy, session.id] : a.readBy.filter((u) => u !== session.id) }
      : a));
    try {
      const response = await fetch(`/api/announcements/${id}/read`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read })
      });
      if (!response.ok) throw new Error();
    } catch {
      setAnnouncements((current) => current.map((a) => a.id === id
        ? { ...a, readBy: read ? a.readBy.filter((u) => u !== session.id) : [...a.readBy, session.id] }
        : a));
      toast("No se pudo guardar tu lectura.", "error");
    }
  }

  const advisors = data?.users.filter((u) => u.role === "ASESOR") ?? [];
  const authorName = (id: string) => data?.users.find((u) => u.id === id)?.name ?? "Gerencia";
  const authorPhoto = (id: string) => data?.users.find((u) => u.id === id)?.photoUrl ?? null;

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast("Solo se permiten imágenes JPG, PNG o WEBP.", "error"); return; }
    if (file.size > 5 * 1024 * 1024) { toast("La imagen debe pesar menos de 5 MB.", "error"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setTitle(""); setBody(""); removeImage();
      toast("Comunicado publicado.", "success");
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      toast("No se pudo publicar el comunicado.", "error");
    } finally {
      setSubmitting(false);
    }
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
      toast("Comunicado eliminado.", "success");
    } catch {
      setAnnouncements(previous);
      toast("No se pudo eliminar el comunicado.", "error");
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  if (error && !data) return <DesktopError onRetry={reload} />;

  return (
    <>
      <div className="grid gap-10 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <DeskReveal index={0}>
          <div className="xl:sticky xl:top-20">
            <DeskSection title="Nuevo comunicado">
              <DeskPanel>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-caption text-muted">
                    Llega a {advisors.length} {advisors.length === 1 ? "asesor" : "asesores"} por push y notificación interna.
                  </p>
                  <DeskButton
                    type="button"
                    onClick={() => setShowAnnouncementPrompt((prev) => !prev)}
                    aria-expanded={showAnnouncementPrompt}
                    className="min-h-8 px-2.5 text-caption"
                  >
                    <Sparkles size={13} className="text-accent" /> IA
                  </DeskButton>
                </div>

                {/* Panel de redacción con IA. Antes iba con blancos y negros
                    fijos (bg-[#0A0A0A], text-white): en tema claro era ilegible. */}
                {showAnnouncementPrompt ? (
                  <div className="mb-3 space-y-2 rounded-xl border border-accent/25 bg-accent-quiet p-3">
                    <label htmlFor="prompt-ia" className="flex items-center gap-1.5 text-caption font-medium text-ink">
                      <Sparkles size={12} className="text-accent" /> ¿De qué trata el comunicado?
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="prompt-ia"
                        type="text"
                        value={announcementPrompt}
                        onChange={(e) => setAnnouncementPrompt(e.target.value)}
                        placeholder="Promoción de jeans 30% este fin de semana…"
                        className={`${deskInput} min-h-9 flex-1 text-caption`}
                      />
                      <DeskButton
                        type="button"
                        onClick={() => void handleGenerateAnnouncement()}
                        disabled={generatingAnnouncement || !announcementPrompt.trim()}
                        className="min-h-9 shrink-0 px-3 text-caption"
                      >
                        {generatingAnnouncement ? "Generando…" : "Generar"}
                      </DeskButton>
                    </div>
                  </div>
                ) : null}

                <form className="grid gap-3" onSubmit={publish}>
                  <AppInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
                  <AppTextarea label="Mensaje" value={body} onChange={(e) => setBody(e.target.value)} required />

                  <div>
                    <p className="mb-1.5 text-caption font-medium text-muted">Imagen (opcional)</p>
                    {imagePreview ? (
                      <div className="relative overflow-hidden rounded-xl border border-line">
                        <NextImage src={imagePreview} alt="Previsualización del comunicado" width={600} height={300} className="max-h-52 w-full object-cover" />
                        <button
                          type="button"
                          onClick={removeImage}
                          aria-label="Quitar imagen"
                          className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/55 text-white backdrop-blur-sm"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-panel text-ui font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent"
                      >
                        <ImagePlus size={16} /> Adjuntar imagen
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
                  </div>

                  <DeskPrimaryButton type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Publicando…" : saved ? "¡Enviado!" : "Publicar comunicado"}
                  </DeskPrimaryButton>
                </form>
              </DeskPanel>
            </DeskSection>
          </div>
        </DeskReveal>

        <DeskReveal index={1}>
          <DeskSection title={`Publicados · ${filtered.length}`}>
            {announcements.length > 0 ? (
              <div className="relative mb-4 max-w-md">
                <label className="sr-only" htmlFor="buscar-comunicado">Buscar comunicado</label>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  id="buscar-comunicado"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar comunicado…"
                  className={`${deskInput} pl-9`}
                />
              </div>
            ) : null}

            {!data ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-36" />)}</div>
            ) : announcements.length === 0 ? (
              <DeskEmpty
                icon={Megaphone}
                title="Sin comunicados todavía"
                hint="Publica el primero desde el panel de la izquierda. Al equipo le llega como notificación push."
              />
            ) : filtered.length === 0 ? (
              <DeskEmpty title="Sin resultados" hint={`Nada coincide con “${query}”.`} />
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((item) => {
                  const reads = item.readBy.length;
                  const readPct = advisors.length ? Math.round((reads / advisors.length) * 100) : 0;
                  const reactionCount = item.reactions.length;
                  // Sin leer por todo el equipo = "sin atender". Es exactamente
                  // el caso para el que existe ShineBorder.
                  const unread = advisors.length > 0 && reads < advisors.length;

                  const card = (
                    <article className="rounded-xl border border-line bg-card p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <ProfileAvatar name={authorName(item.authorId)} photoUrl={authorPhoto(item.authorId)} size="sm" className="size-8 shrink-0 rounded-lg text-[10px] shadow-none" />
                          <div className="min-w-0">
                            <h3 className="text-ui font-semibold leading-tight text-ink">{item.title}</h3>
                            <p className="text-caption text-muted">{authorName(item.authorId)} · {item.date}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setPendingDeleteId(item.id)}
                          aria-label={`Eliminar ${item.title}`}
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <p className="mt-3 max-w-[70ch] whitespace-pre-line text-ui leading-6 text-ink-2">{item.body}</p>

                      {item.imageUrl ? (
                        <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block max-w-2xl overflow-hidden rounded-xl border border-line">
                          <NextImage src={item.imageUrl} alt="Imagen del comunicado" width={900} height={400} className="max-h-72 w-full object-cover" />
                        </a>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        <Badge tone={readPct >= 100 ? "success" : "default"}>
                          {reads}/{advisors.length} leído{reads === 1 ? "" : "s"} · {readPct}%
                        </Badge>
                        {reactionCount > 0 ? <Badge tone="info">{reactionCount} reacción{reactionCount === 1 ? "" : "es"}</Badge> : null}

                        {session ? (
                          <DeskButton
                            onClick={() => void toggleOwnRead(item.id)}
                            className={`ml-auto min-h-8 px-3 text-caption ${item.readBy.includes(session.id) ? "border-ok/40 text-ok" : ""}`}
                          >
                            <Check size={14} />
                            {item.readBy.includes(session.id) ? "Lectura confirmada" : "Confirmar mi lectura"}
                          </DeskButton>
                        ) : null}
                      </div>
                    </article>
                  );

                  return (
                    <motion.div key={item.id} layout exit={{ opacity: 0, scale: 0.96, x: 40 }} className="mb-3">
                      {unread ? <ShineBorder radius="rounded-[14px]" ringPx={1.5}>{card}</ShineBorder> : card}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </DeskSection>
        </DeskReveal>
      </div>

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
