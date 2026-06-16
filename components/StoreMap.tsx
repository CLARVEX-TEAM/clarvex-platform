"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, MapPin, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { FIXTURE_TYPES, FIXTURE_TYPE_LABELS, type FixtureType } from "@/lib/fixtures";

export type Fixture = { id: string; name: string; type: FixtureType; col: number; row: number; rotation: number; styles: string[] };

type Draft = { id: string | null; name: string; type: FixtureType; col: number; row: number; rotation: number; stylesText: string };

const MIN_COLS = 4;
const MIN_ROWS = 3;

export function StoreMap({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [view, setView] = useState<Fixture | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    setLoadError(false);
    fetch("/api/fixtures", { cache: "no-store" })
      .then((r) => r.ok ? r.json() as Promise<{ fixtures: Fixture[] }> : Promise.reject())
      .then((payload) => setFixtures(payload.fixtures))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const byCell = useMemo(() => {
    const map = new Map<string, Fixture>();
    for (const f of fixtures) map.set(`${f.col}:${f.row}`, f);
    return map;
  }, [fixtures]);

  const maxCol = fixtures.reduce((m, f) => Math.max(m, f.col), 0);
  const maxRow = fixtures.reduce((m, f) => Math.max(m, f.row), 0);
  // En edición dejamos una fila/columna extra para colocar nuevos muebles.
  const cols = Math.max(MIN_COLS, maxCol + (editMode ? 1 : 0));
  const rows = Math.max(MIN_ROWS, maxRow + (editMode ? 1 : 0));

  function openNew(col: number, row: number) {
    setDraft({ id: null, name: "", type: "TABLE", col, row, rotation: 0, stylesText: "" });
  }
  function openEdit(f: Fixture) {
    setDraft({ id: f.id, name: f.name, type: f.type, col: f.col, row: f.row, rotation: f.rotation ?? 0, stylesText: f.styles.join("\n") });
  }

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) { toast("Indica un nombre para el mueble.", "error"); return; }
    const styles = draft.stylesText.split("\n").map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      const body = JSON.stringify({ name, type: draft.type, col: draft.col, row: draft.row, rotation: draft.rotation, styles });
      const response = draft.id
        ? await fetch(`/api/fixtures/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/fixtures", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const payload = await response.json() as { fixture?: Fixture; error?: string };
      if (!response.ok || !payload.fixture) { toast(payload.error ?? "No se pudo guardar.", "error"); return; }
      const saved = payload.fixture;
      setFixtures((current) => draft.id ? current.map((f) => f.id === draft.id ? saved : f) : [...current, saved]);
      toast(draft.id ? "Mueble actualizado." : "Mueble agregado.", "success");
      setDraft(null);
    } catch {
      toast("No se pudo guardar.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const previous = fixtures;
    setFixtures((current) => current.filter((f) => f.id !== deleteId));
    try {
      const response = await fetch(`/api/fixtures/${deleteId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      toast("Mueble eliminado.", "success");
    } catch {
      setFixtures(previous);
      toast("No se pudo eliminar.", "error");
    } finally {
      setDeleting(false);
      setDeleteId(null);
      setDraft(null);
    }
  }

  if (loading) {
    return <div className="grid animate-pulse grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div>;
  }
  if (loadError) {
    return <Card className="text-center"><p className="font-black text-ink">No se pudo cargar el mapa</p><Button className="mt-3" onClick={load}>Reintentar</Button></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Boxes size={16} className="text-volt" />
          <span>{fixtures.length} mueble{fixtures.length === 1 ? "" : "s"} · toca uno para ver sus estilos</span>
        </div>
        {canEdit ? (
          <Button variant={editMode ? "primary" : "glass"} className="min-h-10 px-3.5" onClick={() => setEditMode((v) => !v)} icon={<Pencil size={15} />}>
            {editMode ? "Listo" : "Editar mapa"}
          </Button>
        ) : null}
      </div>

      {fixtures.length === 0 && !editMode ? (
        <Card>
          <EmptyState icon={MapPin} title="Sin mapa aún" description={canEdit ? "Activa “Editar mapa” y toca una celda para agregar tu primer mueble." : "La gerencia aún no ha configurado el mapa de la tienda."} />
        </Card>
      ) : (
        <div className="no-scrollbar overflow-x-auto pb-2">
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(116px, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(84px, auto))`, minWidth: cols * 124 }}
          >
            {Array.from({ length: rows }).flatMap((_, r) =>
              Array.from({ length: cols }).map((__, c) => {
                const col = c + 1;
                const row = r + 1;
                const fixture = byCell.get(`${col}:${row}`);
                if (fixture) {
                  return (
                    <motion.button
                      key={fixture.id}
                      layout
                      whileTap={{ scale: 0.97 }}
                      onClick={() => editMode ? openEdit(fixture) : setView(fixture)}
                      style={{ gridColumn: col, gridRow: row }}
                      className="group relative flex flex-col rounded-2xl border border-volt/25 bg-volt/[0.06] p-2.5 text-left transition hover:border-volt/50 hover:bg-volt/10"
                    >
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="shrink-0 text-volt" />
                        <span className="truncate text-[13px] font-black text-ink">{fixture.name}</span>
                      </span>
                      <span className="mt-1 text-[11px] font-bold text-muted">{fixture.styles.length} estilo{fixture.styles.length === 1 ? "" : "s"}</span>
                      {fixture.styles.length > 0 ? (
                        <span className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted/80">{fixture.styles.join(", ")}</span>
                      ) : null}
                      {editMode ? <Pencil size={12} className="absolute right-2 top-2 text-volt opacity-0 transition group-hover:opacity-100" /> : null}
                    </motion.button>
                  );
                }
                if (!editMode) {
                  return <span key={`${col}:${row}`} style={{ gridColumn: col, gridRow: row }} className="rounded-2xl border border-dashed border-line/60" />;
                }
                return (
                  <button
                    key={`${col}:${row}`}
                    onClick={() => openNew(col, row)}
                    style={{ gridColumn: col, gridRow: row }}
                    className="tappable grid place-items-center rounded-2xl border border-dashed border-line text-muted/50 transition hover:border-volt/40 hover:text-volt"
                    aria-label={`Agregar mueble en columna ${col}, fila ${row}`}
                  >
                    <Plus size={18} />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Panel de consulta (estilos del mueble) */}
      <AnimatePresence>
        {view ? (
          <Sheet onClose={() => setView(null)} title={view.name} icon={<MapPin size={18} className="text-volt" />}>
            {view.styles.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Este mueble aún no tiene estilos registrados.</p>
            ) : (
              <ul className="space-y-1.5">
                {view.styles.map((style, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-sm font-semibold text-ink">
                    <Tag size={14} className="shrink-0 text-volt" /> {style}
                  </li>
                ))}
              </ul>
            )}
          </Sheet>
        ) : null}
      </AnimatePresence>

      {/* Editor (gerencia) */}
      <AnimatePresence>
        {draft ? (
          <Sheet
            onClose={() => setDraft(null)}
            title={draft.id ? "Editar mueble" : "Nuevo mueble"}
            icon={<Pencil size={18} className="text-volt" />}
          >
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Nombre del mueble / rack</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} placeholder="Ej. Rack 1, Mueble entrada" className="min-h-12 rounded-2xl border border-line bg-panel px-3.5 text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/10" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Tipo de mueble (forma en 3D)</span>
                <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FixtureType })} className="min-h-12 rounded-2xl border border-line bg-panel px-3.5 text-sm font-bold text-ink outline-none focus:border-volt">
                  {FIXTURE_TYPES.map((t) => <option key={t} value={t}>{FIXTURE_TYPE_LABELS[t]}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Columna</span>
                  <input type="number" min={1} max={24} value={draft.col} onChange={(e) => setDraft({ ...draft, col: Math.max(1, Number(e.target.value) || 1) })} className="min-h-12 rounded-2xl border border-line bg-panel px-3.5 text-sm font-bold text-ink outline-none focus:border-volt" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Fila</span>
                  <input type="number" min={1} max={40} value={draft.row} onChange={(e) => setDraft({ ...draft, row: Math.max(1, Number(e.target.value) || 1) })} className="min-h-12 rounded-2xl border border-line bg-panel px-3.5 text-sm font-bold text-ink outline-none focus:border-volt" />
                </label>
              </div>
              <div className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Orientación (girar)</span>
                <div className="flex gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setDraft({ ...draft, rotation: deg })}
                      className={cn("tappable min-h-10 flex-1 rounded-xl text-sm font-black transition", draft.rotation === deg ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Estilos (uno por línea)</span>
                <textarea value={draft.stylesText} onChange={(e) => setDraft({ ...draft, stylesText: e.target.value })} rows={6} placeholder={"Estilo A\nEstilo B\nEstilo C"} className="resize-none rounded-2xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/10" />
              </label>
              <div className="flex gap-2">
                {draft.id ? (
                  <Button variant="danger" className="min-h-12" onClick={() => setDeleteId(draft.id)} icon={<Trash2 size={16} />}>Eliminar</Button>
                ) : null}
                <Button variant="primary" className="min-h-12 flex-1" loading={saving} onClick={() => void saveDraft()}>{draft.id ? "Guardar cambios" : "Agregar mueble"}</Button>
              </div>
            </div>
          </Sheet>
        ) : null}
      </AnimatePresence>

      <ConfirmDialog
        open={deleteId !== null}
        title="¿Eliminar este mueble?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function Sheet({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative w-full max-w-md rounded-t-3xl border border-line bg-white p-5 shadow-2xl dark:bg-[#1a2540] sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">{icon}<h2 className="text-lg font-black text-ink">{title}</h2></div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full bg-slate-100 text-ink dark:bg-slate-800"><X size={16} /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
