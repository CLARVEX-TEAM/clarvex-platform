"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { FIXTURE_TYPES, FIXTURE_TYPE_LABELS, type FixtureType } from "@/lib/fixtures";
import type { Fixture } from "@/components/StoreMap";

type Initial = { id?: string; name?: string; type?: FixtureType; col: number; row: number; rotation?: number; styles?: string[] };

/** Editor de un mueble (crear o editar). Maneja su propio guardado/borrado. */
export function FixtureEditor({ initial, onSaved, onDeleted, onClose }: {
  initial: Initial;
  onSaved: (fixture: Fixture) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const id = initial.id ?? null;
  const [name, setName] = useState(initial.name ?? "");
  const [type, setType] = useState<FixtureType>(initial.type ?? "TABLE");
  const [col, setCol] = useState(initial.col);
  const [row, setRow] = useState(initial.row);
  const [rotation, setRotation] = useState(initial.rotation ?? 0);
  const [stylesText, setStylesText] = useState((initial.styles ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const input = "min-h-12 rounded-2xl border border-line bg-panel px-3.5 text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/10";

  async function save() {
    const n = name.trim();
    if (!n) { toast("Indica un nombre para el mueble.", "error"); return; }
    const styles = stylesText.split("\n").map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      const body = JSON.stringify({ name: n, type, col, row, rotation, styles });
      const res = id
        ? await fetch(`/api/fixtures/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/fixtures", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const payload = await res.json() as { fixture?: Fixture; error?: string };
      if (!res.ok || !payload.fixture) { toast(payload.error ?? "No se pudo guardar.", "error"); return; }
      toast(id ? "Mueble actualizado." : "Mueble agregado.", "success");
      onSaved(payload.fixture);
    } catch {
      toast("No se pudo guardar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/fixtures/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Mueble eliminado.", "success");
      onDeleted(id);
    } catch {
      toast("No se pudo eliminar.", "error");
    } finally {
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line bg-white p-5 shadow-2xl dark:bg-[#1a2540] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Pencil size={18} className="text-volt" /><h2 className="text-lg font-black text-ink">{id ? "Editar mueble" : "Nuevo mueble"}</h2></div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full bg-slate-100 text-ink dark:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Nombre del mueble / rack</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ej. Rack 1, Mueble entrada" className={input} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Tipo de mueble (forma en 3D)</span>
            <select value={type} onChange={(e) => setType(e.target.value as FixtureType)} className={cn(input, "font-bold")}>
              {FIXTURE_TYPES.map((t) => <option key={t} value={t}>{FIXTURE_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Columna</span>
              <input type="number" min={1} max={24} value={col} onChange={(e) => setCol(Math.max(1, Number(e.target.value) || 1))} className={cn(input, "font-bold")} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Fila</span>
              <input type="number" min={1} max={40} value={row} onChange={(e) => setRow(Math.max(1, Number(e.target.value) || 1))} className={cn(input, "font-bold")} />
            </label>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Orientación (girar)</span>
            <div className="flex gap-2">
              {[0, 90, 180, 270].map((deg) => (
                <button key={deg} type="button" onClick={() => setRotation(deg)} className={cn("tappable min-h-10 flex-1 rounded-xl text-sm font-black transition", rotation === deg ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}>{deg}°</button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Estilos (uno por línea)</span>
            <textarea value={stylesText} onChange={(e) => setStylesText(e.target.value)} rows={5} placeholder={"Estilo A\nEstilo B"} className={cn(input, "resize-none py-2.5")} />
          </label>
          <div className="flex gap-2">
            {id ? <Button variant="danger" className="min-h-12" onClick={() => setConfirmDel(true)} icon={<Trash2 size={16} />}>Eliminar</Button> : null}
            <Button variant="primary" className="min-h-12 flex-1" loading={saving} onClick={() => void save()}>{id ? "Guardar cambios" : "Agregar mueble"}</Button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog open={confirmDel} title="¿Eliminar este mueble?" confirmLabel="Eliminar" loading={deleting} onConfirm={() => void del()} onCancel={() => setConfirmDel(false)} />
    </div>
  );
}
