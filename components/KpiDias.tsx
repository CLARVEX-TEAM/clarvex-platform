"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Card, ProfileAvatar, Skeleton } from "@/components/ui";
import { money } from "@/lib/format";
import type { DiaDeVenta } from "@/lib/kpi-dias";
import { cn } from "@/lib/utils";

// Pestaña «Por día»: la venta de cada día del periodo que se está viendo.
// Gerencia toca un día y ve cuánto vendió cada quien; el asesor ve lo suyo
// (el API solo le manda sus filas).

const DIA = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const DIA_LARGO = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fechaCorta = (iso: string) => {
  const t = DIA.format(new Date(`${iso}T00:00:00.000Z`)).replace(/\./g, "");
  return t.charAt(0).toUpperCase() + t.slice(1); // «Sáb 8 de ago», no «Sáb 8 De Ago»
};
const fechaLarga = (iso: string) => {
  const t = DIA_LARGO.format(new Date(`${iso}T00:00:00.000Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function tonoAlcance(alcance: number | null) {
  if (alcance == null) return "text-muted";
  if (alcance >= 100) return "text-success";
  if (alcance >= 85) return "text-warn";
  return "text-orchid";
}

export function KpiDiasView({ start, end, periodLabel }: { start?: string; end?: string; periodLabel: string }) {
  const [dias, setDias] = useState<DiaDeVenta[] | null>(null);
  const [gerencia, setGerencia] = useState(false);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState<DiaDeVenta | null>(null);

  useEffect(() => {
    if (!start || !end) return;
    const controller = new AbortController();
    setDias(null);
    setError(false);
    fetch(`/api/kpis/dias?start=${start}&end=${end}`, { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: { dias: DiaDeVenta[]; gerencia: boolean }) => {
        setDias(payload.dias);
        setGerencia(payload.gerencia);
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException)) setError(true);
      });
    return () => controller.abort();
  }, [start, end]);

  if (error) return <Card className="p-4"><p className="text-sm font-semibold text-muted">No se pudo cargar la venta por día.</p></Card>;
  if (!dias) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  if (dias.length === 0) return <Card className="p-4"><p className="text-sm font-semibold text-muted">Todavía no hay días en {periodLabel}.</p></Card>;

  return (
    <>
      <Card className="p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-volt" size={18} />
            <h2 className="text-lg font-semibold text-ink">{gerencia ? "Venta de la tienda por día" : "Tu venta por día"}</h2>
          </div>
          <Badge>{dias.length} días</Badge>
        </div>
        {gerencia ? <p className="mb-2 text-xs font-semibold text-muted">Toca un día para ver cuánto vendió cada quien.</p> : null}
        <ul className="divide-y divide-line">
          {dias.map((dia) => {
            const contenido = (
              <>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{fechaCorta(dia.fecha)}</p>
                  {dia.capturado ? (
                    <p className="text-xs font-semibold text-muted">
                      {dia.tickets} tickets · {dia.piezas} piezas{dia.meta > 0 ? ` · meta ${money(dia.meta)}` : ""}
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-muted">{dia.meta > 0 ? `Sin captura · meta ${money(dia.meta)}` : "Sin captura"}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                    <p className={cn("text-sm font-semibold", dia.venta < 0 ? "text-orchid" : "text-ink")}>{dia.capturado ? money(dia.venta) : "—"}</p>
                    {dia.capturado && dia.alcance != null ? <p className={cn("text-xs font-semibold", tonoAlcance(dia.alcance))}>{Math.round(dia.alcance)}%</p> : null}
                  </div>
                  {gerencia && dia.personas.length > 0 ? <ChevronRight size={16} className="text-muted" /> : null}
                </div>
              </>
            );
            return (
              <li key={dia.fecha}>
                {gerencia && dia.personas.length > 0 ? (
                  <button type="button" onClick={() => setAbierto(dia)} className="tappable flex w-full items-center justify-between gap-3 py-2.5 text-left">
                    {contenido}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 py-2.5">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      <DetalleDelDia dia={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

function DetalleDelDia({ dia, onClose }: { dia: DiaDeVenta | null; onClose: () => void }) {
  return (
    <Dialog.Root open={Boolean(dia)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AnimatePresence>
        {dia ? (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-70 bg-black/50 backdrop-blur-xs" />}
            />
            <div className="pointer-events-none fixed inset-0 z-70 flex items-end justify-center p-4 sm:items-center">
              <Dialog.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, y: 28, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="pointer-events-auto relative flex max-h-[80vh] w-full max-w-sm flex-col rounded-3xl border border-line bg-white p-5 shadow-2xl dark:bg-panel"
                  />
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-ink">{fechaLarga(dia.fecha)}</Dialog.Title>
                    <Dialog.Description className="mt-0.5 text-sm font-semibold text-muted">
                      Tienda: {money(dia.venta)}
                      {dia.alcance != null ? <span className={cn("ml-1.5", tonoAlcance(dia.alcance))}>{Math.round(dia.alcance)}%</span> : null}
                      {dia.trafico ? ` · tráfico ${dia.trafico}` : ""}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close aria-label="Cerrar" className="tappable grid size-9 shrink-0 place-items-center rounded-full bg-panel text-muted">
                    <X size={18} />
                  </Dialog.Close>
                </div>
                <ul className="mt-3 divide-y divide-line overflow-y-auto">
                  {dia.personas.map((p) => (
                    <li key={p.userId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold capitalize text-ink">{p.nombre.toLowerCase()}</p>
                          <p className="text-xs font-semibold text-muted">
                            {p.capturado ? `${p.tickets} tickets · ${p.piezas} piezas` : "Sin captura"}
                            {p.meta > 0 ? ` · meta ${money(p.meta)}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn("text-sm font-semibold", p.venta < 0 ? "text-orchid" : "text-ink")}>{p.capturado ? money(p.venta) : "—"}</p>
                        {p.capturado && p.alcance != null ? <p className={cn("text-xs font-semibold", tonoAlcance(p.alcance))}>{Math.round(p.alcance)}%</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Dialog.Popup>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
