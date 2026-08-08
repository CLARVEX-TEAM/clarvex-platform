"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { Check, ImagePlus, PackageSearch, RotateCcw, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS } from "@/lib/inventory";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Button, Card, ProfileAvatar } from "@/components/ui";
import { DeleteButton } from "@/components/ActionButtons";
import { SendButton } from "@/components/SendButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

type Report = {
  id: string;
  productName: string;
  category: string;
  note: string | null;
  photoUrl: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { name: string; photoUrl?: string | null };
  resolvedBy: { name: string } | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function FaltantesPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<string>("AGOTADO");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
      const data = await fetch("/api/inventory", { cache: "no-store" }).then((response) => response.json() as Promise<{ reports?: Report[] }>);
      setReports(data.reports ?? []);
    } catch {
      toast("No se pudieron cargar los reportes.", "error");
    } finally {
      setLoading(false);
    }
  }

  function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast("Solo JPG, PNG o WEBP.", "error"); return; }
    if (file.size > 5 * 1024 * 1024) { toast("La foto debe pesar menos de 5 MB.", "error"); return; }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhoto(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (productName.trim().length < 2) { toast("Indica el producto.", "error"); return; }
    setSending(true);
    try {
      const form = new FormData();
      form.append("productName", productName.trim());
      form.append("category", category);
      if (note.trim()) form.append("note", note.trim());
      if (photo) form.append("photo", photo);
      const response = await fetch("/api/inventory", { method: "POST", body: form });
      const payload = await response.json() as { report?: Report; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "No se pudo enviar el reporte.");
      setReports((current) => [payload.report!, ...current]);
      setProductName("");
      setNote("");
      clearPhoto();
      toast("Reporte enviado.", "success");
      setSent(true);
      window.setTimeout(() => setSent(false), 2000);
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo enviar el reporte.", "error");
    } finally {
      setSending(false);
    }
  }

  async function setReportStatus(id: string, next: "ABIERTO" | "RESUELTO") {
    setBusyId(id);
    try {
      const response = await fetch(`/api/inventory/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      toast("No se pudo actualizar el reporte.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setBusyId(id);
    const previous = reports;
    setReports((current) => current.filter((report) => report.id !== id));
    try {
      const response = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setReports(previous);
      toast("No se pudo eliminar el reporte.", "error");
    } finally {
      setBusyId(null);
      setPendingDeleteId(null);
    }
  }

  const open = reports.filter((report) => report.status === "ABIERTO");
  const resolved = reports.filter((report) => report.status === "RESUELTO");
  const inputClass = "min-h-11 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt";

  return (
    <>
      <AppHeader title="Faltantes" subtitle="Reporta productos agotados o faltantes" backHref={isManager ? "/manager" : "/advisor"} />
      <AppFrame>
        <Card className="mb-3 p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <PackageSearch className="text-volt" size={18} />
            <h2 className="text-lg font-semibold">Nuevo reporte</h2>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Producto</span>
              <input value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={120} placeholder="Ej. Tenis modelo X talla 27" className={inputClass} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">Tipo</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
                {INVENTORY_CATEGORIES.map((value) => <option key={value} value={value}>{INVENTORY_CATEGORY_LABELS[value]}</option>)}
              </select>
            </label>
            {preview ? (
              <div className="relative overflow-hidden rounded-2xl border border-line">
                <NextImage src={preview} alt="Vista previa" width={800} height={300} className="max-h-48 w-full object-cover" unoptimized />
                <button type="button" onClick={clearPhoto} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white"><X size={14} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-line bg-panel px-3 text-sm font-semibold text-muted transition hover:border-volt hover:text-volt">
                <ImagePlus size={16} /> Adjuntar foto (opcional)
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhotoChange} />
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Nota (opcional)…" className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt" />
            <SendButton type="button" onClick={() => void submit()} loading={sending} success={sent} sentLabel="¡Enviado!" className="w-full">Enviar reporte</SendButton>
          </div>
        </Card>

        <Card className="p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Abiertos</h2>
            <Badge tone={open.length > 0 ? "warn" : "default"}>{open.length}</Badge>
          </div>
          {loading ? (
            <p className="py-4 text-sm font-semibold text-muted">Cargando…</p>
          ) : open.length === 0 ? (
            <p className="py-3 text-sm text-muted">Sin reportes abiertos.</p>
          ) : (
            <div className="space-y-2.5">
              {open.map((report) => (
                <ReportRow key={report.id} report={report} isManager={isManager} busy={busyId === report.id} onResolve={() => void setReportStatus(report.id, "RESUELTO")} onDelete={() => setPendingDeleteId(report.id)} onReopen={() => void setReportStatus(report.id, "ABIERTO")} />
              ))}
            </div>
          )}
        </Card>

        {resolved.length > 0 ? (
          <Card className="mt-3 p-3.5">
            <h2 className="mb-2.5 text-lg font-semibold text-muted">Resueltos</h2>
            <div className="space-y-2.5">
              {resolved.map((report) => (
                <ReportRow key={report.id} report={report} isManager={isManager} busy={busyId === report.id} onResolve={() => void setReportStatus(report.id, "RESUELTO")} onDelete={() => setPendingDeleteId(report.id)} onReopen={() => void setReportStatus(report.id, "ABIERTO")} />
              ))}
            </div>
          </Card>
        ) : null}
      </AppFrame>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar este reporte?"
        confirmLabel="Eliminar"
        loading={busyId !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

function ReportRow({ report, isManager, busy, onResolve, onDelete, onReopen }: { report: Report; isManager: boolean; busy: boolean; onResolve: () => void; onDelete: () => void; onReopen: () => void }) {
  const resolved = report.status === "RESUELTO";
  return (
    <div className={`rounded-2xl border border-line p-3 ${resolved ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{report.productName}</p>
          <p className="text-xs text-muted">{INVENTORY_CATEGORY_LABELS[report.category] ?? report.category} · {formatDate(report.createdAt)}</p>
        </div>
        <Badge tone={resolved ? "success" : "warn"}>{resolved ? "Resuelto" : "Abierto"}</Badge>
      </div>
      {report.note ? <p className="mt-2 text-sm text-muted">“{report.note}”</p> : null}
      {report.photoUrl ? (
        <a href={report.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-line">
          <NextImage src={report.photoUrl} alt={report.productName} width={800} height={300} className="max-h-44 w-full object-cover" unoptimized />
        </a>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <ProfileAvatar name={report.reporter.name} photoUrl={report.reporter.photoUrl} size="sm" />
        <p className="text-xs text-muted">Reportó {report.reporter.name}{resolved && report.resolvedBy ? ` · cerró ${report.resolvedBy.name}` : ""}</p>
      </div>
      {isManager ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {resolved ? (
            <Button type="button" variant="ghost" icon={<RotateCcw size={16} />} onClick={onReopen} disabled={busy} className="min-h-10">Reabrir</Button>
          ) : (
            <Button type="button" variant="primary" icon={<Check size={16} />} onClick={onResolve} disabled={busy} className="min-h-10">Resolver</Button>
          )}
          <DeleteButton type="button" variant="ghost" iconSize={16} loading={busy} onClick={onDelete} className="min-h-10">Eliminar</DeleteButton>
        </div>
      ) : null}
    </div>
  );
}
