"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarClock, ImagePlus, PenLine, X } from "lucide-react";
import type { AppData } from "@/lib/app-data";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SendButton } from "@/components/SendButton";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";

type LogEntry = AppData["logEntries"][number];

export default function EscritorioBitacora() {
  const { data, setData, error, reload } = useDesktopData();
  const toast = useToast();
  const [category, setCategory] = useState("Apertura");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const preview = useMemo(() => evidence ? URL.createObjectURL(evidence) : null, [evidence]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useUnsavedGuard(Boolean(description.trim() || comment.trim() || evidence));

  if (error && !data) return <DesktopError onRetry={reload} />;
  if (!data) {
    return (
      <div className="grid animate-pulse grid-cols-5 gap-5">
        <div className="col-span-2 h-80 rounded-3xl bg-slate-200 dark:bg-slate-800" />
        <div className="col-span-3 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl bg-slate-200 dark:bg-slate-800" />)}</div>
      </div>
    );
  }

  const entries = [...data.logEntries].sort((a, b) => b.date.localeCompare(a.date));
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Equipo";

  async function createLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, description }) });
      const payload = await response.json() as { logEntry?: LogEntry; error?: string };
      if (!response.ok || !payload.logEntry) { toast(payload.error ?? "No se pudo guardar el registro.", "error"); return; }
      if (comment.trim()) {
        await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logEntryId: payload.logEntry.id, body: comment }) }).catch(() => undefined);
      }
      if (evidence) {
        const form = new FormData();
        form.set("file", evidence);
        form.set("note", evidenceNote);
        form.set("logEntryId", payload.logEntry.id);
        await fetch("/api/evidences/upload", { method: "POST", body: form }).catch(() => undefined);
      }
      setData({ ...data, logEntries: [...data.logEntries, payload.logEntry] });
      setDescription(""); setComment(""); setEvidence(null); setEvidenceNote("");
      toast("Registro guardado.", "success");
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      toast("No se pudo guardar el registro.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = "w-full rounded-2xl border border-line bg-panel px-3.5 py-3 text-sm font-semibold text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/10";

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Nuevo registro */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-4 flex items-center gap-2"><PenLine className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Nuevo registro</h2></div>
        <form className="grid gap-3" onSubmit={createLog}>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option>Apertura</option><option>Cliente</option><option>Inventario</option><option>Equipo</option><option>Cierre</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Descripción</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required placeholder="Evento relevante de apertura, cliente, inventario o cierre…" className={`${inputClass} resize-none`} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Comentario (opcional)</span>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={2} className={`${inputClass} resize-none`} />
          </label>
          {preview ? (
            <div className="relative h-44 overflow-hidden rounded-2xl border border-line">
              <Image src={preview} alt="Vista previa de evidencia" fill sizes="360px" className="object-cover" unoptimized />
              <button type="button" onClick={() => setEvidence(null)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white" aria-label="Quitar evidencia"><X size={15} /></button>
            </div>
          ) : null}
          <label className="tappable flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-panel text-sm font-bold text-muted transition hover:border-volt/40 hover:text-volt">
            <ImagePlus size={17} /> {evidence ? "Cambiar evidencia" : "Agregar evidencia (opcional)"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} />
          </label>
          {evidence ? <input value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} maxLength={500} placeholder="Nota de evidencia (opcional)" className={inputClass} /> : null}
          <SendButton type="submit" loading={submitting} success={saved} sentLabel="¡Guardado!" className="w-full">Guardar registro</SendButton>
        </form>
      </Card>

      {/* Línea de tiempo */}
      <div className="col-span-3 space-y-3">
        {entries.length === 0 ? (
          <Card><EmptyState icon={BookOpen} title="Sin registros aún" description="Captura el primer evento de operación desde el panel de la izquierda." /></Card>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.div key={entry.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="p-5">
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl border border-success/25 bg-success/10 text-success"><CalendarClock size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge>{entry.category}</Badge>
                        <p className="text-xs text-muted">{new Date(entry.date).toLocaleString("es-MX")}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink/80">{entry.description}</p>
                      <p className="mt-1 text-xs font-bold text-success">{userName(entry.authorId)}</p>
                      <ResourceDiscussion target={{ logEntryId: entry.id }} />
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
