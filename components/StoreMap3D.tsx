"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, MapPin, Maximize2, Tag, X } from "lucide-react";
import type { Fixture } from "@/components/StoreMap";
import { Button, Card, EmptyState } from "@/components/ui";

const Scene3D = dynamic(() => import("@/components/map3d/Scene3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm font-bold text-muted">Cargando vista 3D…</div>
});

export function StoreMap3D() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<Fixture | null>(null);

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
  if (fixtures.length === 0) return <Card><EmptyState icon={MapPin} title="Sin mapa aún" description="La gerencia aún no ha configurado los muebles. Usa la pestaña “Administrar” para agregarlos." /></Card>;

  return (
    <div className="relative h-[62vh] min-h-[440px] max-h-[680px] overflow-hidden rounded-3xl border border-line bg-[#f1f5fb] dark:border-[#2a3a5c]">
      <Scene3D fixtures={fixtures} selectedId={selected?.id ?? null} onSelect={setSelected} />

      {/* Pista de uso */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-sm backdrop-blur">
        <Boxes size={13} className="text-volt" /> Arrastra para girar · toca un mueble
      </div>

      {/* Botón vista general */}
      {selected ? (
        <button onClick={() => setSelected(null)} className="tappable absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-volt shadow-sm backdrop-blur transition hover:bg-white">
          <Maximize2 size={13} /> Vista general
        </button>
      ) : null}

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
                <button onClick={() => setSelected(null)} aria-label="Cerrar" className="grid size-7 place-items-center rounded-full bg-slate-100 text-ink dark:bg-slate-800"><X size={14} /></button>
              </div>
            </div>
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
    </div>
  );
}
