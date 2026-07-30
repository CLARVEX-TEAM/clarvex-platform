"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, FileText, GraduationCap, Paperclip, Trash2, X } from "lucide-react";
import { TRAINING_CATEGORIES, TRAINING_CATEGORY_LABELS } from "@/lib/training";
import { Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";
import {
  DeskButton, DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  linkUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  author: string;
  createdAt: string;
  viewedByMe: boolean;
  viewCount: number;
  viewers?: { id: string; name: string }[];
};

export default function EscritorioCapacitacion() {
  const toast = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [advisorCount, setAdvisorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("VENTAS");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useUnsavedGuard(Boolean(title.trim() || description.trim() || linkUrl.trim() || file));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const data = await fetch("/api/training", { cache: "no-store" }).then((r) => r.json() as Promise<{ resources?: Resource[]; advisorCount?: number }>);
      setResources(data.resources ?? []);
      setAdvisorCount(data.advisorCount ?? 0);
    } catch {
      toast("No se pudieron cargar los recursos.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (title.trim().length < 2) { toast("Indica un título.", "error"); return; }
    if (!linkUrl.trim() && !file) { toast("Agrega un enlace o un archivo.", "error"); return; }
    setSending(true);
    try {
      const form = new FormData();
      form.append("title", title.trim());
      if (description.trim()) form.append("description", description.trim());
      form.append("category", category);
      if (linkUrl.trim()) form.append("linkUrl", linkUrl.trim());
      if (file) form.append("file", file);
      const response = await fetch("/api/training", { method: "POST", body: form });
      const payload = await response.json() as { resource?: Resource; error?: string };
      if (!response.ok || !payload.resource) throw new Error(payload.error ?? "No se pudo publicar.");
      setResources((current) => [payload.resource!, ...current]);
      setTitle(""); setDescription(""); setLinkUrl(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast("Recurso publicado.", "success");
      setSent(true);
      window.setTimeout(() => setSent(false), 2000);
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo publicar.", "error");
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setBusyId(id);
    const previous = resources;
    setResources((current) => current.filter((r) => r.id !== id));
    try {
      const response = await fetch(`/api/training/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      toast("Recurso eliminado.", "success");
    } catch {
      setResources(previous);
      toast("No se pudo eliminar.", "error");
    } finally {
      setBusyId(null);
      setPendingDeleteId(null);
    }
  }

  async function openResource(resource: Resource) {
    const url = resource.linkUrl ?? resource.fileUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    if (!resource.viewedByMe) {
      setResources((current) => current.map((item) => item.id === resource.id ? { ...item, viewedByMe: true, viewCount: item.viewCount + 1 } : item));
      await fetch(`/api/training/${resource.id}/view`, { method: "POST" }).catch(() => undefined);
    }
  }

  return (
    <div className="grid gap-10 xl:grid-cols-[24rem_minmax(0,1fr)]">
      {/* Nuevo recurso */}
      <DeskReveal index={0}>
        <div className="xl:sticky xl:top-20">
          <DeskSection title="Nuevo recurso" hint="Visible para todo el equipo, con aviso al publicarlo.">
            <DeskPanel>
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Título</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Manual de atención a cliente" className={deskInput} />
                </label>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Categoría</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={deskInput}>
                    {TRAINING_CATEGORIES.map((value) => <option key={value} value={value}>{TRAINING_CATEGORY_LABELS[value]}</option>)}
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Descripción (opcional)</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Para qué sirve y cuándo usarlo…"
                    className={`${deskInput} resize-none py-2.5`}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Enlace (video, SharePoint…)</span>
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} inputMode="url" placeholder="https://…" className={deskInput} />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed border-line bg-panel px-3 text-ui font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    {file ? <FileText size={16} className="shrink-0" /> : <Paperclip size={16} className="shrink-0" />}
                    <span className="truncate">{file ? file.name : "Adjuntar PDF o imagen (opcional)"}</span>
                  </button>
                  {file ? (
                    <button
                      type="button"
                      onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                      aria-label="Quitar archivo"
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  ) : null}
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

                <DeskPrimaryButton type="button" onClick={() => void submit()} disabled={sending} className="w-full">
                  {sending ? "Publicando…" : sent ? "¡Publicado!" : "Publicar recurso"}
                </DeskPrimaryButton>
              </div>
            </DeskPanel>
          </DeskSection>
        </div>
      </DeskReveal>

      {/* Biblioteca */}
      <DeskReveal index={1}>
        <DeskSection title={`Biblioteca · ${resources.length}`}>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <DeskSkeleton key={i} className="h-40" />)}</div>
          ) : resources.length === 0 ? (
            <DeskEmpty
              icon={GraduationCap}
              title="Sin recursos todavía"
              hint="Sube el primer material desde la izquierda: un PDF, una imagen o un enlace a video."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {resources.map((resource) => (
                  <motion.article
                    key={resource.id}
                    layout
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="rounded-xl border border-line bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-ui font-semibold text-ink">{resource.title}</h3>
                        <p className="text-caption text-muted">
                          {TRAINING_CATEGORY_LABELS[resource.category] ?? resource.category} · {resource.author}
                        </p>
                      </div>
                      <button
                        onClick={() => setPendingDeleteId(resource.id)}
                        aria-label={`Eliminar ${resource.title}`}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {resource.description ? (
                      <p className="mt-2 text-ui leading-6 text-ink-2">{resource.description}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <DeskButton type="button" onClick={() => void openResource(resource)} className="min-h-9 border-accent/35 text-accent">
                        {resource.fileUrl && !resource.linkUrl ? <FileText size={15} /> : <ExternalLink size={15} />}
                        Abrir
                      </DeskButton>
                      <Badge tone={resource.viewCount >= advisorCount && advisorCount > 0 ? "success" : "default"}>
                        {resource.viewCount}/{advisorCount} lo consultaron
                      </Badge>
                    </div>

                    {resource.viewers && resource.viewers.length > 0 ? (
                      <p className="mt-2 text-caption text-muted">{resource.viewers.map((v) => v.name).join(", ")}</p>
                    ) : null}
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          )}
        </DeskSection>
      </DeskReveal>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar este recurso?"
        confirmLabel="Eliminar"
        loading={busyId !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
