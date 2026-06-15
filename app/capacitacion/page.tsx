"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, GraduationCap, ImagePlus, Send, Trash2, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { TRAINING_CATEGORIES, TRAINING_CATEGORY_LABELS } from "@/lib/training";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card } from "@/components/ui";

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

export default function CapacitacionPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [advisorCount, setAdvisorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("VENTAS");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = Boolean(session && session.role !== "ASESOR");

  useEffect(() => {
    getSession().then((current) => { if (!current) router.replace("/login"); else setSession(current); });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    try {
      const data = await fetch("/api/training", { cache: "no-store" }).then((response) => response.json() as Promise<{ resources?: Resource[]; advisorCount?: number }>);
      setResources(data.resources ?? []);
      setAdvisorCount(data.advisorCount ?? 0);
    } catch {
      setStatus("No se pudieron cargar los recursos.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (title.trim().length < 2) { setStatus("Indica un título."); return; }
    if (!linkUrl.trim() && !file) { setStatus("Agrega un enlace o un archivo."); return; }
    setSending(true);
    setStatus("");
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
      setTitle("");
      setDescription("");
      setLinkUrl("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setStatus("Recurso publicado. ✅");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo publicar.");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar este recurso?")) return;
    setBusyId(id);
    const previous = resources;
    setResources((current) => current.filter((resource) => resource.id !== id));
    try {
      const response = await fetch(`/api/training/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setResources(previous);
      setStatus("No se pudo eliminar.");
    } finally {
      setBusyId(null);
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

  const inputClass = "min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt";

  return (
    <>
      <AppHeader title="Capacitación" subtitle="Biblioteca de recursos del equipo" backHref={isManager ? "/manager" : "/advisor"} />
      <AppFrame>
        {isManager ? (
          <Card className="mb-3 p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap className="text-volt" size={18} />
              <h2 className="text-lg font-black">Nuevo recurso</h2>
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-bold text-muted">Título</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Ej. Manual de atención" className={inputClass} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-bold text-muted">Categoría</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
                  {TRAINING_CATEGORIES.map((value) => <option key={value} value={value}>{TRAINING_CATEGORY_LABELS[value]}</option>)}
                </select>
              </label>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={2} placeholder="Descripción (opcional)…" className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt" />
              <label className="grid gap-1">
                <span className="text-xs font-bold text-muted">Enlace (link / video / SharePoint)</span>
                <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} inputMode="url" placeholder="https://…" className={inputClass} />
              </label>
              <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-line bg-panel px-3 text-sm font-semibold text-muted transition hover:border-volt hover:text-volt">
                {file ? <FileText size={16} /> : <ImagePlus size={16} />}
                <span className="truncate">{file ? file.name : "Adjuntar PDF o imagen (opcional)"}</span>
                {file ? <X size={15} className="ml-auto" onClick={(event) => { event.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }} /> : null}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <Button type="button" variant="primary" icon={<Send size={16} />} onClick={() => void submit()} disabled={sending} className="w-full">{sending ? "Publicando…" : "Publicar recurso"}</Button>
              {status ? <p className="text-sm font-semibold text-muted">{status}</p> : null}
            </div>
          </Card>
        ) : null}

        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando recursos…</Card>
        ) : resources.length === 0 ? (
          <Card><p className="font-black">Sin recursos</p><p className="mt-2 text-sm text-muted">Aquí aparecerán los materiales de capacitación del equipo.</p></Card>
        ) : (
          <div className="space-y-2.5">
            {resources.map((resource) => (
              <Card key={resource.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-ink">{resource.title}</p>
                    <p className="text-xs text-muted">{TRAINING_CATEGORY_LABELS[resource.category] ?? resource.category} · {resource.author}</p>
                  </div>
                  {resource.viewedByMe ? <Badge tone="success">Visto</Badge> : <Badge tone="warn">Nuevo</Badge>}
                </div>
                {resource.description ? <p className="mt-2 text-sm text-muted">{resource.description}</p> : null}
                <button type="button" onClick={() => void open(resource)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-volt/10 text-sm font-black text-volt ring-1 ring-volt/30 transition active:scale-95">
                  {resource.fileUrl && !resource.linkUrl ? <FileText size={16} /> : <ExternalLink size={16} />}
                  Abrir recurso
                </button>
                {isManager ? (
                  <div className="mt-3 border-t border-line pt-2.5">
                    <p className="text-xs font-bold text-muted">{resource.viewCount}/{advisorCount} del equipo lo consultaron</p>
                    {resource.viewers && resource.viewers.length > 0 ? (
                      <p className="mt-1 text-xs text-muted">{resource.viewers.map((viewer) => viewer.name).join(", ")}</p>
                    ) : null}
                    <button type="button" onClick={() => void remove(resource.id)} disabled={busyId === resource.id} className="mt-2 flex items-center gap-1.5 text-sm font-black text-rose-600">
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}
