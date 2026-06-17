"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Send, X } from "lucide-react";
import { ProfileAvatar } from "@/components/ui";

const MAX_FILES = 5;

type Target = { pendingId: string } | { taskId: string } | { logEntryId: string };
type EvidenceItem = { id: string; url: string; note: string | null; createdAt: string; uploadedBy: { name: string; photoUrl: string | null } };
type CommentItem = { id: string; body: string; createdAt: string; author: { name: string; photoUrl: string | null } };

export function ResourceDiscussion({ target, className = "" }: { target: Target; className?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evidences, setEvidences] = useState<EvidenceItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const query = useMemo(() => new URLSearchParams(target).toString(), [target]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  async function load() {
    setLoading(true);
    setStatus("");
    try {
      const [evidenceResponse, commentResponse] = await Promise.all([
        fetch(`/api/evidences/upload?${query}`),
        fetch(`/api/comments?${query}`)
      ]);
      const evidencePayload = await evidenceResponse.json() as { evidences?: EvidenceItem[]; error?: string };
      const commentPayload = await commentResponse.json() as { comments?: CommentItem[]; error?: string };
      if (!evidenceResponse.ok || !commentResponse.ok) throw new Error(evidencePayload.error ?? commentPayload.error ?? "No se pudo cargar la actividad.");
      setEvidences(evidencePayload.evidences ?? []);
      setComments(commentPayload.comments ?? []);
      setLoaded(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo cargar la actividad.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await load();
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length === 0) return;
    setFiles((prev) => [...prev, ...selected].slice(0, MAX_FILES));
    event.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadEvidence() {
    if (files.length === 0) return setStatus("Selecciona al menos una imagen.");
    setStatus("Subiendo evidencias...");
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.set("note", note);
    Object.entries(target).forEach(([key, value]) => form.set(key, value));
    const response = await fetch("/api/evidences/upload", { method: "POST", body: form });
    const payload = await response.json() as { evidences?: EvidenceItem[]; error?: string };
    if (!response.ok || !payload.evidences) return setStatus(payload.error ?? "No se pudo subir la evidencia.");
    setEvidences((items) => [...payload.evidences!, ...items]);
    setFiles([]);
    setNote("");
    const count = payload.evidences.length;
    setStatus(count === 1 ? "Evidencia guardada." : `${count} evidencias guardadas.`);
    window.dispatchEvent(new Event("notifications-updated"));
  }

  async function sendComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    setStatus("Guardando comentario...");
    const response = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, body: comment }) });
    const payload = await response.json() as { comment?: CommentItem; error?: string };
    if (!response.ok || !payload.comment) return setStatus(payload.error ?? "No se pudo guardar el comentario.");
    setComments((items) => [...items, payload.comment!]);
    setComment("");
    setStatus("Comentario guardado.");
    window.dispatchEvent(new Event("notifications-updated"));
  }

  return (
    <div className={`mt-2.5 border-t border-line/70 pt-2.5 ${className}`}>
      <button type="button" onClick={() => void toggle()} className="flex min-h-10 w-full items-center justify-between rounded-xl px-2 text-sm font-black text-volt transition hover:bg-blue-50 active:scale-[0.99]" aria-expanded={open}>
        <span className="flex items-center gap-2"><MessageCircle size={16} /> Evidencias y comentarios</span>
        <span className="text-xs text-muted">{evidences.length + comments.length || "Abrir"}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 p-3">
          {loading ? <p className="text-sm text-muted">Cargando actividad...</p> : null}
          {!loading && evidences.length === 0 ? <p className="text-sm text-muted">Aún no hay evidencias.</p> : null}
          {evidences.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {evidences.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white dark:bg-slate-700">
                  <Image src={item.url} alt={item.note || "Evidencia"} fill sizes="96px" className="object-cover" />
                </a>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2">
            {previewUrls.length > 0 ? (
              <>
                <p className="text-xs font-semibold text-muted">
                  {files.length} foto{files.length > 1 ? "s" : ""} seleccionada{files.length > 1 ? "s" : ""}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {previewUrls.map((url, i) => (
                    <div key={i} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white dark:bg-slate-700">
                      <Image src={url} alt={`Vista previa ${i + 1}`} fill sizes="96px" className="object-cover" unoptimized />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-white/90 dark:bg-slate-700/90 text-ink shadow-sm"
                        aria-label="Quitar foto"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {files.length < MAX_FILES ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white dark:bg-slate-800 px-3 text-sm font-black text-ink transition active:scale-[0.99]"
              >
                <ImagePlus size={17} />
                {files.length > 0 ? `Agregar más fotos (${files.length}/${MAX_FILES})` : "Agregar evidencia"}
              </button>
            ) : null}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" multiple onChange={handleFileSelect} />

            {files.length > 0 ? (
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="min-h-11 rounded-xl border border-line bg-white dark:bg-slate-800 px-3 text-sm text-ink outline-none focus:border-volt"
                placeholder="Nota opcional (para todas las fotos)"
              />
            ) : null}
            {files.length > 0 ? (
              <button type="button" onClick={() => void uploadEvidence()} className="min-h-11 rounded-xl bg-volt px-3 text-sm font-black text-white">
                Subir {files.length > 1 ? `${files.length} evidencias` : "evidencia"}
              </button>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-line pt-3">
            {comments.length === 0 ? <p className="text-sm text-muted">Aún no hay comentarios.</p> : comments.map((item) => (
              <div key={item.id} className="flex gap-2">
                <ProfileAvatar name={item.author.name} photoUrl={item.author.photoUrl} size="sm" className="size-8 rounded-full shadow-none" />
                <div className="min-w-0 flex-1 rounded-xl bg-white dark:bg-slate-800 px-3 py-2">
                  <p className="text-xs font-black text-ink">{item.author.name}</p>
                  <p className="mt-0.5 text-sm leading-5 text-muted">{item.body}</p>
                </div>
              </div>
            ))}
            <form onSubmit={sendComment} className="flex gap-2">
              <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white dark:bg-slate-800 px-3 text-sm text-ink outline-none focus:border-volt" placeholder="Escribe un comentario" />
              <button type="submit" disabled={!comment.trim()} className="grid size-11 shrink-0 place-items-center rounded-xl bg-volt text-white disabled:opacity-40" aria-label="Enviar comentario"><Send size={17} /></button>
            </form>
          </div>
          {status ? <p className="text-xs font-semibold text-muted">{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
