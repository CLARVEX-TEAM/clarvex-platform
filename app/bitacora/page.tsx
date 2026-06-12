"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarClock, FileText, ImagePlus, PenLine, X } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, StatCard } from "@/components/ui";
import { ResourceDiscussion } from "@/components/ResourceDiscussion";

export default function BitacoraPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [category, setCategory] = useState("Apertura");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const preview = useMemo(() => evidence ? URL.createObjectURL(evidence) : null, [evidence]);

  useEffect(() => {
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!data) {
    return (
      <>
        <AppHeader title="Bitacora" subtitle="Cargando registros desde PostgreSQL." backHref="/manager" />
        <AppFrame><Card>Conectando...</Card></AppFrame>
        <BottomNav />
      </>
    );
  }

  const entries = [...data.logEntries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries[entries.length - 1];
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";

  async function createLog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setFormStatus("Guardando...");
    const response = await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, description }) });
    const payload = await response.json() as { logEntry?: AppData["logEntries"][number]; error?: string };
    if (!response.ok || !payload.logEntry) { setFormStatus(payload.error ?? "No se pudo guardar el registro."); return; }
    if (comment.trim()) {
      const commentResponse = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logEntryId: payload.logEntry.id, body: comment }) });
      if (!commentResponse.ok) return setFormStatus("Registro guardado, pero el comentario no pudo guardarse.");
    }
    if (evidence) {
      const form = new FormData();
      form.set("file", evidence);
      form.set("note", evidenceNote);
      form.set("logEntryId", payload.logEntry.id);
      const evidenceResponse = await fetch("/api/evidences/upload", { method: "POST", body: form });
      if (!evidenceResponse.ok) return setFormStatus("Registro guardado, pero la evidencia no pudo subirse.");
    }
    setData({ ...data, logEntries: [...data.logEntries, payload.logEntry] });
    setDescription(""); setComment(""); setEvidence(null); setEvidenceNote(""); setFormStatus("Registro guardado.");
  }

  return (
    <>
      <AppHeader title="Bitacora" subtitle="Registro cronologico de operacion de tienda." backHref="/manager" />
      <AppFrame>
        <Card className="mb-3 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink/45">Operacion</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-ink">{entries.length} registros</h2>
              <p className="mt-1 text-sm text-ink/58">
                Ultimo: {latest ? new Date(latest.date).toLocaleDateString("es-MX") : "sin registros"}
              </p>
            </div>
            <div className="grid size-12 place-items-center rounded-[1.1rem] border border-orchid/25 bg-orchid/10 text-orchid">
              <BookOpen size={21} />
            </div>
          </div>
        </Card>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <StatCard compact label="Categorias" value={String(new Set(entries.map((entry) => entry.category)).size)} detail="En uso" tone="mint" />
          <StatCard compact label="Autores" value={String(new Set(entries.map((entry) => entry.authorId)).size)} detail="Equipo" tone="ember" />
        </div>

        <Card className="mb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Nuevo registro</h2>
              <p className="mt-1 text-sm text-ink/50">Captura eventos relevantes de apertura, cliente, inventario o cierre.</p>
            </div>
            <PenLine className="text-volt" size={20} />
          </div>
          <form className="mt-3 grid gap-2.5" onSubmit={createLog}>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-12 rounded-2xl border border-line/80 bg-panel/75 px-3 py-3 text-ink outline-none transition focus:border-volt focus:ring-4 focus:ring-volt/15">
              <option>Apertura</option><option>Cliente</option><option>Inventario</option><option>Equipo</option><option>Cierre</option>
            </select>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20 rounded-2xl border border-line/80 bg-panel/75 px-3 py-2.5 text-ink outline-none transition placeholder:text-ink/34 focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="Descripcion del registro" required />
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} className="min-h-16 rounded-2xl border border-line/80 bg-panel/75 px-3 py-2.5 text-ink outline-none transition placeholder:text-ink/34 focus:border-volt focus:ring-4 focus:ring-volt/15" placeholder="Comentario adicional (opcional)" />
            {preview ? (
              <div className="relative h-40 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-700">
                <Image src={preview} alt="Vista previa de evidencia" fill sizes="360px" className="object-cover" unoptimized />
                <button type="button" onClick={() => setEvidence(null)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-white/90" aria-label="Quitar evidencia"><X size={16} /></button>
              </div>
            ) : null}
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-panel text-sm font-black text-ink">
              <ImagePlus size={17} /> {evidence ? "Cambiar evidencia" : "Agregar evidencia"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} />
            </label>
            {evidence ? <input value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} maxLength={500} className="min-h-12 rounded-2xl border border-line bg-panel px-3 outline-none focus:border-volt" placeholder="Nota de evidencia (opcional)" /> : null}
            {formStatus ? <p className="text-sm font-semibold text-muted">{formStatus}</p> : null}
            <Button type="submit" className="w-full" icon={<FileText size={17} />}>
              Guardar registro
            </Button>
          </form>
        </Card>

        <div className="space-y-3">
          {entries.map((entry, index) => (
            <Card key={entry.id} className="relative overflow-hidden">
              <div className="absolute bottom-0 left-5 top-11 w-px bg-line/70" />
              <div className="relative flex gap-3">
                <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
                  <CalendarClock size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge>{entry.category}</Badge>
                    <p className="text-xs text-ink/42">{new Date(entry.date).toLocaleString("es-MX")}</p>
                  </div>
                  <p className="mt-2 text-[13px] leading-5 text-ink/80">{entry.description}</p>
                  <p className="mt-1 text-xs font-semibold text-mint">{index + 1}. {userName(entry.authorId)}</p>
                  <ResourceDiscussion target={{ logEntryId: entry.id }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </AppFrame>
      <BottomNav />
    </>
  );
}
