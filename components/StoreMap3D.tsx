"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, MapPin, Maximize2, Move, Pencil, Plus, Tag, X } from "lucide-react";
import type { Fixture } from "@/lib/fixtures";
import { Button, Card, EmptyState } from "@/components/ui";
import { MapErrorBoundary } from "@/components/map3d/MapErrorBoundary";
import { FixtureEditor } from "@/components/map3d/FixtureEditor";

const MOVE_STEP = 0.5;

const Scene3D = dynamic(() => import("@/components/map3d/Scene3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm font-bold text-muted">Cargando vista 3D…</div>
});

export function StoreMap3D({ canEdit = false }: { canEdit?: boolean }) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Fixture | null>(null);
  const [editing, setEditing] = useState<Fixture | "new" | null>(null);
  const selectedRef = useRef<Fixture | null>(null);
  selectedRef.current = selected;
  const editingRef = useRef<typeof editing>(null);
  editingRef.current = editing;
  const moveTimer = useRef<number | undefined>(undefined);

  function handleSaved(fixture: Fixture) {
    setFixtures((prev) => prev.some((f) => f.id === fixture.id) ? prev.map((f) => f.id === fixture.id ? fixture : f) : [...prev, fixture]);
    setSelected(fixture);
    setEditing(null);
  }
  function handleDeleted(id: string) {
    setFixtures((prev) => prev.filter((f) => f.id !== id));
    setSelected(null);
    setEditing(null);
  }

  // Posición por defecto de un mueble nuevo: el centro de los existentes.
  function newPos() {
    if (fixtures.length === 0) return { posX: 0, posZ: 0 };
    const sx = fixtures.reduce((s, f) => s + f.posX, 0) / fixtures.length;
    const sz = fixtures.reduce((s, f) => s + f.posZ, 0) / fixtures.length;
    return { posX: Math.round(sx * 2) / 2, posZ: Math.round(sz * 2) / 2 };
  }

  // Mover el mueble seleccionado con las flechas del teclado (gerencia).
  useEffect(() => {
    if (!canEdit) return;
    function onKey(e: KeyboardEvent) {
      if (editingRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const sel = selectedRef.current;
      if (!sel) return;
      let dx = 0, dz = 0;
      if (e.key === "ArrowUp") dz = -MOVE_STEP;
      else if (e.key === "ArrowDown") dz = MOVE_STEP;
      else if (e.key === "ArrowLeft") dx = -MOVE_STEP;
      else if (e.key === "ArrowRight") dx = MOVE_STEP;
      else return;
      e.preventDefault();
      const nx = sel.posX + dx, nz = sel.posZ + dz;
      setFixtures((prev) => prev.map((f) => f.id === sel.id ? { ...f, posX: nx, posZ: nz } : f));
      setSelected((s) => s && s.id === sel.id ? { ...s, posX: nx, posZ: nz } : s);
      window.clearTimeout(moveTimer.current);
      moveTimer.current = window.setTimeout(() => {
        const cur = selectedRef.current;
        if (!cur || cur.id !== sel.id) return;
        void fetch(`/api/fixtures/${sel.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posX: cur.posX, posZ: cur.posZ }) });
      }, 450);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

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

  // Mantener el panel sincronizado si los datos cambian.
  useEffect(() => {
    if (selected) setSelected((current) => current ? fixtures.find((f) => f.id === current.id) ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixtures]);

  if (loading) return <div className="grid h-[60vh] min-h-[420px] animate-pulse place-items-center rounded-3xl bg-slate-200 dark:bg-slate-800 text-sm font-bold text-muted">Cargando mapa…</div>;
  if (loadError) return <Card className="text-center"><p className="font-black text-ink">No se pudo cargar el mapa</p><Button className="mt-3" onClick={load}>Reintentar</Button></Card>;
  if (fixtures.length === 0) {
    return (
      <>
        <Card><EmptyState icon={MapPin} title="Sin mapa aún" description={canEdit ? "Agrega tu primer mueble para empezar el mapa." : "La gerencia aún no ha configurado los muebles."} action={canEdit ? <Button onClick={() => setEditing("new")} icon={<Plus size={16} />}>Agregar mueble</Button> : undefined} /></Card>
        {editing ? <FixtureEditor initial={editing === "new" ? newPos() : editing} onSaved={handleSaved} onDeleted={handleDeleted} onClose={() => setEditing(null)} /> : null}
      </>
    );
  }

  return (
    <MapErrorBoundary fallback={<FixtureList fixtures={fixtures} />}>
    <div className="relative h-[62vh] min-h-[440px] max-h-[680px] overflow-hidden rounded-3xl border border-line bg-[#f1f5fb] dark:border-[#2a3a5c]">
      <Scene3D fixtures={fixtures} selectedId={selected?.id ?? null} onSelect={setSelected} />

      {/* Pista de uso */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm backdrop-blur">
        <Boxes size={13} className="text-volt" /> Arrastra para girar · toca un mueble
      </div>

      {/* Acciones (arriba derecha) */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {selected ? (
          <button onClick={() => setSelected(null)} className="tappable flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-volt shadow-sm backdrop-blur transition hover:bg-white">
            <Maximize2 size={13} /> Vista general
          </button>
        ) : null}
        {canEdit ? (
          <button onClick={() => setEditing("new")} className="tappable flex items-center gap-1.5 rounded-full bg-volt px-3 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:bg-[#1D4ED8]">
            <Plus size={13} /> Nuevo mueble
          </button>
        ) : null}
      </div>

      {/* Panel del mueble seleccionado */}
      <AnimatePresence>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute inset-x-3 bottom-3 mx-auto max-w-md rounded-2xl border border-line bg-white/95 p-4 shadow-xl backdrop-blur dark:bg-[#1a2540]/95"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-volt" />
                <h3 className="text-base font-black text-ink">{selected.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-volt/10 px-2.5 py-1 text-[11px] font-black text-volt">{selected.styles.length} estilo{selected.styles.length === 1 ? "" : "s"}</span>
                {canEdit ? (
                  <button onClick={() => setEditing(selected)} className="tappable flex items-center gap-1 rounded-full bg-volt px-2.5 py-1 text-[11px] font-black text-white transition hover:bg-[#1D4ED8]">
                    <Pencil size={12} /> Editar
                  </button>
                ) : null}
                <button onClick={() => setSelected(null)} aria-label="Cerrar" className="grid size-7 place-items-center rounded-full bg-slate-100 text-ink dark:bg-slate-800"><X size={14} /></button>
              </div>
            </div>
            {canEdit ? (
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <Move size={12} className="text-volt" /> Mueve con las flechas del teclado ← ↑ ↓ →
              </p>
            ) : null}
            {selected.styles.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted">Este mueble aún no tiene estilos registrados.</p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {selected.styles.map((style, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2 text-sm font-semibold text-ink">
                    <Tag size={14} className="shrink-0 text-volt" /> {style}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Editor (gerencia) */}
      {editing ? (
        <FixtureEditor
          initial={editing === "new" ? newPos() : editing}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
    </MapErrorBoundary>
  );
}

/** Respaldo 2D si el navegador no puede con la escena 3D (WebGL). */
function FixtureList({ fixtures }: { fixtures: Fixture[] }) {
  return (
    <div className="space-y-3">
      <p className="rounded-2xl border border-amber-300/40 bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
        Este dispositivo no pudo cargar la vista 3D. Aquí está el listado de muebles y sus estilos.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fixtures.map((f) => (
          <Card key={f.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><MapPin size={15} className="text-volt" /><h3 className="font-black text-ink">{f.name}</h3></div>
              <span className="rounded-full bg-volt/10 px-2.5 py-1 text-[11px] font-black text-volt">{f.styles.length} estilo{f.styles.length === 1 ? "" : "s"}</span>
            </div>
            {f.styles.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.styles.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-[12px] font-semibold text-ink ring-1 ring-line">
                    <Tag size={11} className="text-volt" /> {s}
                  </span>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-muted">Sin estilos registrados.</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}
