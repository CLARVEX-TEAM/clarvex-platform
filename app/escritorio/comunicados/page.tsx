"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, Megaphone, Search, Sparkles, Trash2, X } from "lucide-react";
import type { Announcement } from "@/lib/types";
import { Badge, Card, EmptyState, ProfileAvatar } from "@/components/ui";
import { AppInput, AppTextarea } from "@/components/forms";
import { SendButton } from "@/components/SendButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo generar el comunicado.");
      setTitle(payload.title || "");
      setBody(payload.body || "");
      setShowAnnouncementPrompt(false);
      setAnnouncementPrompt("");
      toast("Comunicado profesional generado con éxito. ¡Revísalo!", "success");
    } catch (err: any) {
      toast(err.message || "Error al generar el comunicado con IA.", "error");
    } finally {
      setGeneratingAnnouncement(false);
    }
  }

  useEffect(() => { if (data) setAnnouncements(data.announcements); }, [data]);

  const term = query.trim().toLowerCase();
  const filtered = term ? announcements.filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(term)) : announcements;

  useUnsavedGuard(Boolean(title.trim() || body.trim() || imageFile));

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
    <div className="grid grid-cols-5 gap-5">
      {/* Crear comunicado */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="text-volt" size={18} />
            <h2 className="text-lg font-semibold text-ink">Nuevo comunicado</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAnnouncementPrompt((prev) => !prev)}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider bg-[#2563EB] text-white px-3 py-1 rounded-xl active:scale-95 transition"
          >
            <Sparkles size={11} />
            IA
          </button>
        </div>

        {showAnnouncementPrompt && (
          <div className="mb-3 rounded-2xl border border-[#2563EB]/20 bg-[#2563EB]/5 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-white flex items-center gap-1">
              <Sparkles size={12} className="text-[#2563EB]" /> Redactar con IA:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={announcementPrompt}
                onChange={(e) => setAnnouncementPrompt(e.target.value)}
                placeholder="Ej. Promoción Jeans 30% descuento este fin..."
                className="flex-1 min-h-9 rounded-xl border border-white/10 bg-[#0A0A0A] px-3 text-xs text-white placeholder-muted outline-none focus:border-[#2563EB]"
              />
              <button
                type="button"
                onClick={() => void handleGenerateAnnouncement()}
                disabled={generatingAnnouncement || !announcementPrompt.trim()}
                className="rounded-xl bg-[#2563EB] px-3 text-xs font-semibold text-white active:scale-95 transition disabled:opacity-50"
              >
                {generatingAnnouncement ? "Generando..." : "Generar"}
              </button>
            </div>
          </div>
        )}

        <form className="grid gap-3" onSubmit={publish}>
          <AppInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <AppTextarea label="Mensaje" value={body} onChange={(e) => setBody(e.target.value)} required />

          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Imagen (opcional)</p>
            {imagePreview ? (
              <div className="relative overflow-hidden rounded-2xl border border-line">
                <NextImage src={imagePreview} alt="Previsualización" width={600} height={300} className="max-h-52 w-full object-cover" />
                <button type="button" onClick={removeImage} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="tappable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-panel text-sm font-bold text-muted transition hover:border-volt/40 hover:text-volt">
                <ImagePlus size={17} /> Adjuntar imagen
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
          </div>

          <SendButton type="submit" loading={submitting} success={saved} sentLabel="¡Enviado!" className="w-full">
            Publicar comunicado
          </SendButton>
          <p className="text-center text-[11px] text-muted">Se notificará a {advisors.length} {advisors.length === 1 ? "asesor" : "asesores"} (push + interna).</p>
        </form>
      </Card>

      {/* Lista de comunicados */}
      <div className="col-span-3 space-y-3">
        {announcements.length > 0 ? (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar comunicado…" className="min-h-11 w-full rounded-2xl border border-line bg-panel pl-10 pr-3 text-sm font-semibold text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/10" />
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {filtered.map((item) => {
            const reads = item.readBy.length;
            const readPct = advisors.length ? Math.round((reads / advisors.length) * 100) : 0;
            const reactionCount = item.reactions.length;
            return (
              <motion.div key={item.id} layout exit={{ opacity: 0, scale: 0.96, x: 40 }}>
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <ProfileAvatar name={authorName(item.authorId)} photoUrl={authorPhoto(item.authorId)} size="sm" className="size-9 rounded-full shadow-none" />
                      <div>
                        <h3 className="text-[15px] font-semibold leading-tight text-ink">{item.title}</h3>
                        <p className="text-[11px] text-muted">{authorName(item.authorId)} · {item.date}</p>
                      </div>
                    </div>
                    <button onClick={() => setPendingDeleteId(item.id)} aria-label="Eliminar comunicado" className="tappable grid size-9 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="mt-2.5 whitespace-pre-line text-sm leading-6 text-ink/80">{item.body}</p>
                  {item.imageUrl ? (
                    <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block overflow-hidden rounded-2xl border border-line">
                      <NextImage src={item.imageUrl} alt="Imagen del comunicado" width={900} height={400} className="max-h-72 w-full object-cover" />
                    </a>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                    <Badge tone={readPct >= 100 ? "success" : "default"}>{reads}/{advisors.length} leído{reads === 1 ? "" : "s"} · {readPct}%</Badge>
                    {reactionCount > 0 ? <Badge tone="info">{reactionCount} reacción{reactionCount === 1 ? "" : "es"}</Badge> : null}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {announcements.length === 0 && data ? (
          <Card><EmptyState icon={Megaphone} title="Sin comunicados" description="Crea el primero para tu equipo desde el panel de la izquierda." /></Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">Sin resultados para “{query}”.</Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar comunicado?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
