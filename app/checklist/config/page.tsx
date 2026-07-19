"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileText, ListChecks, Plus, Trash2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, BottomNav, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Item = { id: string; key: string; section: "APERTURA" | "CIERRE"; kind: "check" | "scan"; label: string; sortOrder: number };
const SECTIONS: { id: "APERTURA" | "CIERRE"; label: string }[] = [
  { id: "APERTURA", label: "Apertura" },
  { id: "CIERRE", label: "Cierre" }
];

export default function ChecklistConfigPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSession().then((current) => {
      if (!current) { router.replace("/login"); return; }
      // Editar puntos es solo de gerencia — ni asesor ni el kiosko.
      if (current.checklistOnly || current.role === "ASESOR") { router.replace("/checklist"); return; }
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/checklist/items", { cache: "no-store" });
      const payload = await response.json() as { items?: Item[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar.");
      setItems(payload.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }

  async function rename(item: Item, label: string) {
    setError("");
    setItems((current) => current.map((i) => i.id === item.id ? { ...i, label } : i));
    try {
      const response = await fetch(`/api/checklist/items/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label })
      });
      if (!response.ok) throw new Error();
    } catch {
      setError("No se pudo renombrar. Recarga para ver el estado real.");
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`¿Quitar "${item.label}" del checklist?`)) return;
    setError("");
    const previous = items;
    setItems((current) => current.filter((i) => i.id !== item.id));
    try {
      const response = await fetch(`/api/checklist/items/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      setItems(previous);
      setError("No se pudo quitar.");
    }
  }

  async function move(item: Item, dir: -1 | 1) {
    const section = items.filter((i) => i.section === item.section);
    const index = section.findIndex((i) => i.id === item.id);
    const other = section[index + dir];
    if (!other) return;
    setError("");
    // Intercambia el orden con el vecino.
    setItems((current) => current.map((i) => {
      if (i.id === item.id) return { ...i, sortOrder: other.sortOrder };
      if (i.id === other.id) return { ...i, sortOrder: item.sortOrder };
      return i;
    }));
    try {
      await Promise.all([
        fetch(`/api/checklist/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: other.sortOrder }) }),
        fetch(`/api/checklist/items/${other.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: item.sortOrder }) })
      ]);
    } catch {
      setError("No se pudo reordenar.");
    }
  }

  async function add(section: "APERTURA" | "CIERRE", kind: "check" | "scan", label: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checklist/items", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section, kind, label })
      });
      const payload = await response.json() as { item?: Item; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? "No se pudo agregar.");
      setItems((current) => [...current, payload.item!]);
      return true;
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "No se pudo agregar.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader title="Editar checklist" subtitle="Puntos de apertura y cierre" backHref="/checklist" />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando…</Card>
        ) : (
          <div className="space-y-3">
            {SECTIONS.map((section) => {
              const list = items.filter((i) => i.section === section.id).sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <Card key={section.id} className="p-3.5">
                  <h2 className="mb-2 text-lg font-semibold">{section.label}</h2>
                  <div className="divide-y divide-line">
                    {list.map((item, index) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        canUp={index > 0}
                        canDown={index < list.length - 1}
                        onRename={(label) => void rename(item, label)}
                        onRemove={() => void remove(item)}
                        onMove={(dir) => void move(item, dir)}
                      />
                    ))}
                    {list.length === 0 ? <p className="py-3 text-xs font-semibold text-muted">Sin puntos en esta sección.</p> : null}
                  </div>
                  <AddItem section={section.id} busy={busy} onAdd={add} />
                </Card>
              );
            })}
            <p className="px-1 text-[11px] text-muted">
              Los puntos de <b>escaneo</b> mandan las fotos como PDF a Telegram (corte de caja, vouchers…). Los de <b>tarea</b> solo se marcan como hechos.
            </p>
          </div>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}

function ItemRow({ item, canUp, canDown, onRename, onRemove, onMove }: {
  item: Item; canUp: boolean; canDown: boolean;
  onRename: (label: string) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const changed = label.trim() !== item.label && label.trim().length >= 2;
  return (
    <div className="flex items-center gap-2 py-2.5">
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", item.kind === "scan" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200" : "bg-panel text-muted")}>
        {item.kind === "scan" ? <FileText size={14} /> : <ListChecks size={14} />}
      </span>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={() => { if (changed) onRename(label.trim()); }}
        maxLength={120}
        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-sm font-bold text-ink outline-none focus:border-line"
      />
      {changed ? <button type="button" onClick={() => onRename(label.trim())} className="shrink-0 rounded-lg bg-volt px-2 py-1 text-[11px] font-semibold text-white">Guardar</button> : null}
      <div className="flex shrink-0 flex-col">
        <button type="button" onClick={() => onMove(-1)} disabled={!canUp} aria-label="Subir" className="text-muted disabled:opacity-30"><ChevronUp size={16} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={!canDown} aria-label="Bajar" className="text-muted disabled:opacity-30"><ChevronDown size={16} /></button>
      </div>
      <button type="button" onClick={onRemove} aria-label="Quitar" className="grid size-8 shrink-0 place-items-center rounded-full text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} /></button>
    </div>
  );
}

function AddItem({ section, busy, onAdd }: {
  section: "APERTURA" | "CIERRE"; busy: boolean;
  onAdd: (section: "APERTURA" | "CIERRE", kind: "check" | "scan", label: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"check" | "scan">("check");
  return (
    <div className="mt-3 rounded-2xl border border-line/70 p-3">
      <p className="mb-2 text-xs font-bold text-muted">Agregar punto</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Nombre del punto"
          maxLength={120}
          className="min-h-10 min-w-0 flex-1 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt"
        />
        <select value={kind} onChange={(event) => setKind(event.target.value as "check" | "scan")} className="min-h-10 rounded-2xl border border-line bg-panel px-2 text-sm font-bold text-ink outline-none focus:border-volt">
          <option value="check">Tarea</option>
          <option value="scan">Escaneo</option>
        </select>
        <Button
          type="button"
          variant="primary"
          disabled={busy || label.trim().length < 2}
          onClick={async () => { if (await onAdd(section, kind, label.trim())) setLabel(""); }}
          className="min-h-10 px-3"
        >
          <Plus size={15} />
        </Button>
      </div>
    </div>
  );
}
