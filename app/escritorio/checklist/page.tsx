"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { Camera, CheckCircle2, Circle, Image as ImageIcon, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Badge } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { compressImage } from "@/lib/image-compress";
import {
  DeskEmpty, DeskMeter, DeskReveal, DeskSection, DeskSkeleton
} from "@/components/desktop/DeskUI";

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
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        {dateLabel ? (
          <p className="text-ui lowercase text-muted first-letter:uppercase">{dateLabel}</p>
        ) : <span />}
        <Link
          href="/checklist/config"
          className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-caption font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <SlidersHorizontal size={14} /> Editar puntos
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-10 lg:grid-cols-2">
          {[0, 1].map((i) => <DeskSkeleton key={i} className="h-96" />)}
        </div>
      ) : items.length === 0 ? (
        <DeskEmpty
          title="Sin puntos de checklist configurados"
          hint="Define los puntos de apertura y cierre en «Editar puntos» para que el equipo pueda marcarlos."
        />
      ) : (
        <div className="grid gap-10 lg:grid-cols-2">
          {SECTIONS.map((section, index) => {
            const sectionItems = items.filter((item) => item.section === section.id);
            const done = sectionItems.filter((item) => item.completed).length;
            const total = sectionItems.length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const SectionIcon = section.icon;
            return (
              <DeskReveal key={section.id} index={index}>
                <DeskSection title={section.label}>
                  <div className="flex items-center gap-3">
                    <SectionIcon size={16} className="shrink-0 text-muted" aria-hidden />
                    <DeskMeter value={progress} className="flex-1" />
                    <Badge tone={done === total && total > 0 ? "success" : "default"}>{done}/{total}</Badge>
                  </div>

                  {sectionItems.length === 0 ? (
                    <p className="mt-4 text-caption text-muted">Sin puntos en esta sección.</p>
                  ) : (
                    <ul className="mt-2">
                      {sectionItems.map((item) => (
                        <ChecklistRow
                          key={item.key}
                          item={item}
                          busy={busyKey === item.key}
                          onToggle={() => void toggle(item)}
                          onPhoto={(file) => void attachPhoto(item, file)}
                        />
                      ))}
                    </ul>
                  )}
                </DeskSection>
              </DeskReveal>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, busy, onToggle, onPhoto }: { item: ChecklistItem; busy: boolean; onToggle: () => void; onPhoto: (file: File) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  return (
    <li className="desk-row flex items-center gap-3 rounded-lg border-b border-line py-2.5 pr-1 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={item.completed}
        aria-label={item.completed ? `Desmarcar ${item.label}` : `Marcar ${item.label}`}
        className="shrink-0 disabled:opacity-50"
      >
        {item.completed ? <CheckCircle2 className="text-ok" size={22} /> : <Circle className="text-muted" size={22} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-ui ${item.completed ? "text-muted line-through" : "text-ink"}`}>{item.label}</p>
        {item.completedAt ? (
          <p className="text-caption text-muted">
            {new Date(item.completedAt).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}
            {item.completedBy ? ` · ${item.completedBy}` : ""}
          </p>
        ) : null}
      </div>

      {item.evidenceUrl ? (
        <a href={item.evidenceUrl} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Ver evidencia de ${item.label}`}>
          <NextImage src={item.evidenceUrl} alt="" width={36} height={36} className="size-9 rounded-lg object-cover" unoptimized />
        </a>
      ) : null}

      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        disabled={busy}
        aria-label={`Tomar foto de ${item.label}`}
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        <Camera size={15} />
      </button>
      <button
        type="button"
        onClick={() => galleryRef.current?.click()}
        disabled={busy}
        aria-label={`Elegir imagen para ${item.label}`}
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        <ImageIcon size={15} />
      </button>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }} />
    </li>
  );
}
