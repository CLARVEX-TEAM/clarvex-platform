"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, FileText, GraduationCap, Paperclip, Trash2, X } from "lucide-react";
import { TRAINING_CATEGORIES, TRAINING_CATEGORY_LABELS } from "@/lib/training";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SendButton } from "@/components/SendButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";

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

  async function open(resource: Resource) {
    const url = resource.linkUrl ?? resource.fileUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    if (!resource.viewedByMe) {
      setResources((current) => current.map((item) => item.id === resource.id ? { ...item, viewedByMe: true, viewCount: item.viewCount + 1 } : item));
      await fetch(`/api/training/${resource.id}/view`, { method: "POST" }).catch(() => undefined);
    }
  }

  const inputClass = "min-h-12 w-full rounded-2xl border border-line bg-panel px-3.5 text-sm font-semibold text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/10";

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Nuevo recurso */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-4 flex items-center gap-2">
          <GraduationCap className="text-volt" size={18} />
          <h2 className="text-lg font-black text-ink">Nuevo recurso</h2>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ej. Manual de atención" className={inputClass} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {TRAINING_CATEGORIES.map((value) => <option key={value} value={value}>{TRAINING_CATEGORY_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Descripción (opcional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder="Para qué sirve este recurso…" className="w-full resize-none rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/10" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Enlace (link / video / SharePoint)</span>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} inputMode="url" placeholder="https://…" className={inputClass} />
          </label>
          <button type="button" onClick={() => fileRef.current?.click()} className="tappable flex min-h-12 items-center gap-2 rounded-2xl border border-dashed border-line bg-panel px-3.5 text-sm font-semibold text-muted transition hover:border-volt/40 hover:text-volt">
            {file ? <FileText size={16} /> : <Paperclip size={16} />}
            <span className="truncate">{file ? file.name : "Adjuntar PDF o imagen (opcional)"}</span>
            {file ? <X size={15} className="ml-auto" onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }} /> : null}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <SendButton type="button" onClick={() => void submit()} loading={sending} success={sent} sentLabel="¡Publicado!" className="w-full">Publicar recurso</SendButton>
          <p className="text-center text-[11px] text-muted">Visible para todo el equipo.</p>
        </div>
      </Card>

      {/* Biblioteca */}
      <div className="col-span-3 space-y-3">
        {loading ? (
          <Card className="p-10 text-center text-sm text-muted">Cargando recursos…</Card>
        ) : resources.length === 0 ? (
          <Card><EmptyState icon={GraduationCap} title="Sin recursos" description="Sube el primer material de capacitación desde el panel de la izquierda." /></Card>
        ) : (
          <AnimatePresence initial={false}>
            {resources.map((resource) => (
              <motion.div key={resource.id} layout exit={{ opacity: 0, scale: 0.96, x: 40 }}>
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-black text-ink">{resource.title}</h3>
                      <p className="text-xs text-muted">{TRAINING_CATEGORY_LABELS[resource.category] ?? resource.category} · {resource.author}</p>
                    </div>
                    <button onClick={() => setPendingDeleteId(resource.id)} aria-label="Eliminar recurso" className="tappable grid size-9 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {resource.description ? <p className="mt-2 text-sm leading-6 text-ink/80">{resource.description}</p> : null}
                  <div className="mt-3 flex items-center gap-3">
                    <button type="button" onClick={() => void open(resource)} className="tappable flex min-h-10 items-center gap-2 rounded-xl bg-volt/10 px-4 text-sm font-black text-volt ring-1 ring-volt/30 transition hover:bg-volt/15">
                      {resource.fileUrl && !resource.linkUrl ? <FileText size={16} /> : <ExternalLink size={16} />}
                      Abrir recurso
                    </button>
                    <Badge tone={resource.viewCount >= advisorCount && advisorCount > 0 ? "success" : "default"}>{resource.viewCount}/{advisorCount} lo consultaron</Badge>
                  </div>
                  {resource.viewers && resource.viewers.length > 0 ? (
                    <p className="mt-2 text-xs text-muted">{resource.viewers.map((v) => v.name).join(", ")}</p>
                  ) : null}
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

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
