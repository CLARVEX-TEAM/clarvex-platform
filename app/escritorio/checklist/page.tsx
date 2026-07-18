"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { Camera, CheckCircle2, Circle, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Badge, Card, ProgressBar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { compressImage } from "@/lib/image-compress";

type Section = "APERTURA" | "CIERRE";
type ChecklistItem = {
  key: string;
  label: string;
  section: Section;
  completed: boolean;
  note: string | null;
  evidenceUrl: string | null;
  completedAt: string | null;
  completedBy: string | null;
};

const SECTIONS: { id: Section; label: string; icon: typeof Sun }[] = [
  { id: "APERTURA", label: "Apertura", icon: Sun },
  { id: "CIERRE", label: "Cierre", icon: Moon }
];

export default function EscritorioChecklist() {
  const toast = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/checklist", { cache: "no-store" });
      const payload = await response.json() as { date: string; items: ChecklistItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el checklist.");
      setItems(payload.items);
      setDate(payload.date);
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : "No se pudo cargar el checklist.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(item: ChecklistItem) {
    setBusyKey(item.key);
    const previous = items;
    setItems((current) => current.map((i) => i.key === item.key ? { ...i, completed: !i.completed } : i));
    try {
      const response = await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key, completed: !item.completed, note: item.note ?? undefined })
      });
      const payload = await response.json() as { items: ChecklistItem[] };
      if (!response.ok) throw new Error();
      setItems(payload.items);
    } catch {
      setItems(previous);
      toast("No se pudo actualizar.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function attachPhoto(item: ChecklistItem, file: File) {
    setBusyKey(item.key);
    try {
      const image = await compressImage(file);
      const form = new FormData();
      form.append("itemKey", item.key);
      form.append("completed", String(item.completed));
      if (item.note) form.append("note", item.note);
      form.append("image", image, "evidencia.jpg");
      const response = await fetch("/api/checklist", { method: "POST", body: form });
      const payload = await response.json() as { items: ChecklistItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo subir la evidencia.");
      setItems(payload.items);
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : "No se pudo subir la evidencia.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  const dateLabel = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {dateLabel ? <p className="text-sm font-bold capitalize text-muted">{dateLabel}</p> : <span />}
        <Link href="/checklist/config" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-black text-muted transition hover:text-volt">
          <SlidersHorizontal size={14} />Editar puntos
        </Link>
      </div>
      {loading ? (
        <Card className="text-sm font-semibold text-muted">Cargando checklist…</Card>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {SECTIONS.map((section) => {
            const sectionItems = items.filter((item) => item.section === section.id);
            const done = sectionItems.filter((item) => item.completed).length;
            const total = sectionItems.length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const SectionIcon = section.icon;
            return (
              <Card key={section.id} className="h-fit p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SectionIcon className="text-volt" size={20} />
                    <h2 className="text-lg font-black text-ink">{section.label}</h2>
                  </div>
                  <Badge tone={done === total && total > 0 ? "success" : "default"}>{done}/{total}</Badge>
                </div>
                <ProgressBar value={progress} />
                <div className="mt-2 divide-y divide-line">
                  {sectionItems.map((item) => (
                    <ChecklistRow
                      key={item.key}
                      item={item}
                      busy={busyKey === item.key}
                      onToggle={() => void toggle(item)}
                      onPhoto={(file) => void attachPhoto(item, file)}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, busy, onToggle, onPhoto }: { item: ChecklistItem; busy: boolean; onToggle: () => void; onPhoto: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button type="button" onClick={onToggle} disabled={busy} aria-pressed={item.completed} className="shrink-0 transition active:scale-90 disabled:opacity-50">
        {item.completed ? <CheckCircle2 className="text-emerald-500" size={24} /> : <Circle className="text-muted" size={24} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${item.completed ? "text-muted line-through" : "text-ink"}`}>{item.label}</p>
        {item.completedAt ? <p className="text-[11px] text-muted">✓ {new Date(item.completedAt).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}</p> : null}
      </div>
      {item.evidenceUrl ? (
        <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="shrink-0">
          <NextImage src={item.evidenceUrl} alt="Evidencia" width={40} height={40} className="size-10 rounded-lg object-cover" unoptimized />
        </a>
      ) : null}
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Adjuntar foto" className="grid size-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition hover:border-volt hover:text-volt active:scale-90 disabled:opacity-50">
        <Camera size={16} />
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
    </div>
  );
}
