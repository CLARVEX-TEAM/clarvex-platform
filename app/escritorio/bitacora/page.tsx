"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarClock, ImagePlus, X } from "lucide-react";
import type { AppData } from "@/lib/app-data";
import { Badge } from "@/components/ui";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";
import { useToast } from "@/components/Toast";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { useUnsavedGuard } from "@/components/desktop/useUnsavedGuard";
import {
  DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";

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
      <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <DeskSkeleton className="h-112" />
        <div className="space-y-3">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-28" />)}</div>
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

  return (
    <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
      {/* Nuevo registro */}
      <DeskReveal index={0}>
        <div className="xl:sticky xl:top-20">
          <DeskSection title="Nuevo registro">
            <DeskPanel>
              <form className="grid gap-3" onSubmit={createLog}>
                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Categoría</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={deskInput}>
                    <option>Apertura</option>
                    <option>Cliente</option>
                    <option>Inventario</option>
                    <option>Equipo</option>
                    <option>Cierre</option>
                  </select>
                </label>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Descripción</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    required
                    placeholder="Evento relevante de apertura, cliente, inventario o cierre…"
                    className={`${deskInput} resize-none py-2.5`}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Comentario (opcional)</span>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    className={`${deskInput} resize-none py-2.5`}
                  />
                </label>

                {preview ? (
                  <div className="relative h-44 overflow-hidden rounded-xl border border-line">
                    <Image src={preview} alt="Vista previa de la evidencia" fill sizes="360px" className="object-cover" unoptimized />
                    <button
                      type="button"
                      onClick={() => setEvidence(null)}
                      className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/55 text-white"
                      aria-label="Quitar evidencia"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : null}

                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-panel text-ui font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent">
                  <ImagePlus size={16} /> {evidence ? "Cambiar evidencia" : "Agregar evidencia (opcional)"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} />
                </label>

                {evidence ? (
                  <input
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                    maxLength={500}
                    placeholder="Nota de la evidencia (opcional)"
                    aria-label="Nota de la evidencia"
                    className={deskInput}
                  />
                ) : null}

                <DeskPrimaryButton type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Guardando…" : saved ? "¡Guardado!" : "Guardar registro"}
                </DeskPrimaryButton>
              </form>
            </DeskPanel>
          </DeskSection>
        </div>
      </DeskReveal>

      {/* Línea de tiempo */}
      <DeskReveal index={1}>
        <DeskSection title={`Registro cronológico · ${entries.length}`}>
          {entries.length === 0 ? (
            <DeskEmpty
              icon={BookOpen}
              title="Sin registros todavía"
              hint="Captura el primer evento de operación desde el panel de la izquierda. Queda con autor y hora."
            />
          ) : (
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <motion.article
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 rounded-xl border border-line bg-card p-5"
                >
                  <div className="flex gap-3">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel text-muted">
                      <CalendarClock size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge>{entry.category}</Badge>
                        <p className="text-caption text-muted">{new Date(entry.date).toLocaleString("es-MX")}</p>
                      </div>
                      <p className="mt-2 max-w-[70ch] text-ui leading-6 text-ink-2">{entry.description}</p>
                      <p className="mt-1 text-caption text-muted">{userName(entry.authorId)}</p>
                      <ResourceDiscussion target={{ logEntryId: entry.id }} />
                    </div>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          )}
        </DeskSection>
      </DeskReveal>
    </div>
  );
}
