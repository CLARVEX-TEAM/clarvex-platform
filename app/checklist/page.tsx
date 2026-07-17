"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { Camera, CheckCircle2, Circle, FileText, Moon, Sun, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProgressBar } from "@/components/ui";

type Section = "APERTURA" | "CIERRE";
type ScanPhoto = { id: string; url: string; fileName: string | null; createdAt: string };
type ChecklistItem = {
  key: string;
  label: string;
  section: Section;
  kind: "check" | "scan";
  completed: boolean;
  note: string | null;
  evidenceUrl: string | null;
  completedAt: string | null;
  completedBy: string | null;
  scans: ScanPhoto[];
};

/** Un escaneo (varias fotos) se considera hecho cuando ya tiene al menos una. */
function isDone(item: ChecklistItem): boolean {
  return item.kind === "scan" ? item.scans.length > 0 : item.completed;
}

const SECTIONS: { id: Section; label: string; icon: typeof Sun }[] = [
  { id: "APERTURA", label: "Apertura", icon: Sun },
  { id: "CIERRE", label: "Cierre", icon: Moon }
];

export default function ChecklistPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((current) => {
      if (!current) { router.replace("/login"); return; }
      if (current.role === "ASESOR") { router.replace("/advisor"); return; }
      setSession(current);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/checklist", { cache: "no-store" });
      const payload = await response.json() as { date: string; items: ChecklistItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el checklist.");
      setItems(payload.items);
      setDate(payload.date);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el checklist.");
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
    } finally {
      setBusyKey(null);
    }
  }

  async function attachPhoto(item: ChecklistItem, file: File) {
    setBusyKey(item.key);
    setError("");
    try {
      const form = new FormData();
      form.append("itemKey", item.key);
      form.append("completed", String(item.completed));
      if (item.note) form.append("note", item.note);
      form.append("image", file);
      const response = await fetch("/api/checklist", { method: "POST", body: form });
      const payload = await response.json() as { items: ChecklistItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo subir la evidencia.");
      setItems(payload.items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir la evidencia.");
    } finally {
      setBusyKey(null);
    }
  }

  async function addScan(item: ChecklistItem, file: File) {
    setBusyKey(item.key);
    setError("");
    try {
      const form = new FormData();
      form.append("itemKey", item.key);
      if (date) form.append("date", date);
      form.append("image", file);
      const response = await fetch("/api/checklist/scan", { method: "POST", body: form });
      const payload = await response.json() as { scan?: ScanPhoto; error?: string };
      if (!response.ok || !payload.scan) throw new Error(payload.error ?? "No se pudo subir la foto.");
      const added = payload.scan;
      setItems((current) => current.map((i) => i.key === item.key ? { ...i, scans: [...i.scans, added] } : i));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo subir la foto.");
    } finally {
      setBusyKey(null);
    }
  }

  async function removeScan(item: ChecklistItem, scanId: string) {
    setError("");
    const previous = items;
    setItems((current) => current.map((i) => i.key === item.key ? { ...i, scans: i.scans.filter((s) => s.id !== scanId) } : i));
    try {
      const response = await fetch(`/api/checklist/scan?id=${scanId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setItems(previous);
      setError("No se pudo borrar la foto.");
    }
  }

  async function generatePdf(item: ChecklistItem): Promise<{ pdfUrl: string; sentToTelegram: boolean }> {
    const response = await fetch("/api/checklist/scan/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemKey: item.key, date: date || undefined })
    });
    const payload = await response.json() as { pdfUrl?: string; sentToTelegram?: boolean; error?: string };
    if (!response.ok || !payload.pdfUrl) throw new Error(payload.error ?? "No se pudo generar el PDF.");
    return { pdfUrl: payload.pdfUrl, sentToTelegram: payload.sentToTelegram ?? false };
  }

  const dateLabel = date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : "";

  return (
    <>
      <AppHeader title="Checklist de tienda" subtitle={dateLabel ? dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1) : "Apertura y cierre"} backHref="/manager" />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando checklist...</Card>
        ) : (
          <div className="space-y-3">
            {SECTIONS.map((section) => {
              const sectionItems = items.filter((item) => item.section === section.id);
              const done = sectionItems.filter(isDone).length;
              const total = sectionItems.length;
              const progress = total ? Math.round((done / total) * 100) : 0;
              const SectionIcon = section.icon;
              return (
                <Card key={section.id} className="p-3.5">
                  <div className="mb-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SectionIcon className="text-volt" size={18} />
                      <h2 className="text-lg font-black">{section.label}</h2>
                    </div>
                    <Badge tone={done === total ? "success" : "default"}>{done}/{total}</Badge>
                  </div>
                  <ProgressBar value={progress} />
                  <div className="mt-2 divide-y divide-line">
                    {sectionItems.map((item) => item.kind === "scan" ? (
                      <ScanRow
                        key={item.key}
                        item={item}
                        busy={busyKey === item.key}
                        onAdd={(file) => void addScan(item, file)}
                        onRemove={(scanId) => void removeScan(item, scanId)}
                        onGeneratePdf={() => generatePdf(item)}
                      />
                    ) : (
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
      </AppFrame>
      <BottomNav />
    </>
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

/**
 * Ítem de ESCANEO: varias páginas por documento (corte de caja, vouchers,
 * depósito). Se escanean las hojas y luego se juntan en UN PDF que se manda al
 * canal de Telegram. `capture="environment"` abre la cámara trasera directo.
 */
function ScanRow({ item, busy, onAdd, onRemove, onGeneratePdf }: {
  item: ChecklistItem;
  busy: boolean;
  onAdd: (file: File) => void;
  onRemove: (scanId: string) => void;
  onGeneratePdf: () => Promise<{ pdfUrl: string; sentToTelegram: boolean }>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; sent: boolean } | null>(null);
  const [pdfError, setPdfError] = useState("");
  const pages = item.scans.length;
  const done = pages > 0;

  // Si cambian las páginas después de generar, el PDF queda desactualizado.
  const pagesKey = item.scans.map((s) => s.id).join(",");
  useEffect(() => { setPdf(null); }, [pagesKey]);

  async function makePdf() {
    setPdfBusy(true);
    setPdfError("");
    try {
      const result = await onGeneratePdf();
      setPdf({ url: result.pdfUrl, sent: result.sentToTelegram });
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0">
          {done ? <CheckCircle2 className="text-emerald-500" size={22} /> : <Circle className="text-muted" size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{item.label}</p>
          <p className="text-[11px] text-muted">{pages ? `${pages} ${pages === 1 ? "página" : "páginas"}` : "Escanea las hojas y genera el PDF"}</p>
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-black text-volt transition hover:border-volt active:scale-95 disabled:opacity-50">
          <Camera size={15} />{busy ? "…" : "Escanear"}
        </button>
      </div>

      {pages ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-[2.1rem]">
          {item.scans.map((scan, index) => (
            <div key={scan.id} className="relative">
              <a href={scan.url} target="_blank" rel="noreferrer">
                <NextImage src={scan.url} alt={`Página ${index + 1}`} width={56} height={56} className="size-14 rounded-lg object-cover" unoptimized />
              </a>
              <span className="absolute bottom-0 left-0 rounded-tr-md rounded-bl-lg bg-black/60 px-1 text-[9px] font-black text-white">{index + 1}</span>
              <button type="button" onClick={() => onRemove(scan.id)} aria-label="Borrar página" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-rose-600 text-white shadow-sm transition active:scale-90">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {pages ? (
        <div className="mt-2 flex items-center gap-2 pl-[2.1rem]">
          <button type="button" onClick={() => void makePdf()} disabled={pdfBusy} className="flex items-center gap-1.5 rounded-xl bg-volt px-3 py-2 text-xs font-black text-white transition hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-50">
            <FileText size={15} />{pdfBusy ? "Generando…" : pdf ? "Regenerar PDF" : "Generar PDF y enviar"}
          </button>
          {pdf ? (
            <a href={pdf.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              ✓ PDF listo{pdf.sent ? " · enviado a Telegram" : ""}
            </a>
          ) : null}
        </div>
      ) : null}
      {pdfError ? <p className="mt-1 pl-[2.1rem] text-[11px] font-semibold text-rose-600">{pdfError}</p> : null}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onAdd(file); event.target.value = ""; }} />
    </div>
  );
}
