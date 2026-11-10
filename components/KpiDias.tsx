"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Crown, Receipt, Shirt, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, ProfileAvatar, Skeleton } from "@/components/ui";
import { money } from "@/lib/format";
import type { DiaDeVenta, PersonaDelDia } from "@/lib/kpi-dias";
import { cn } from "@/lib/utils";

// Pestaña «Por día»: la venta de cada día del periodo que se está viendo.
// Gerencia toca un día (en la gráfica o en la lista) y ve cuánto vendió cada
// quien; el asesor ve lo suyo (el API solo le manda sus filas).

const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const SEMANA = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const MES = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });
const LARGO = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const sinPunto = (t: string) => t.replace(/\./g, "");
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const diaSemana = (iso: string) => mayuscula(sinPunto(SEMANA.format(fecha(iso))));
const diaNumero = (iso: string) => String(fecha(iso).getUTCDate());
const mesCorto = (iso: string) => sinPunto(MES.format(fecha(iso)));
const fechaLarga = (iso: string) => mayuscula(LARGO.format(fecha(iso)));

const cuenta = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const ticketsYPiezas = (t: number, p: number) => `${cuenta(t, "ticket", "tickets")} · ${cuenta(p, "pieza", "piezas")}`;

/** «JESUS ADRIAN HERNANDEZ LUNA» → «Jesus Adrian» */
function nombreCorto(nombre: string) {
  return nombre
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .map(mayuscula)
    .join(" ");
}

type Tono = "bien" | "cerca" | "abajo" | "nada";
function tono(alcance: number | null, capturado: boolean): Tono {
  if (!capturado || alcance == null) return "nada";
  if (alcance >= 100) return "bien";
  if (alcance >= 85) return "cerca";
  return "abajo";
}
const TEXTO: Record<Tono, string> = { bien: "text-success", cerca: "text-warn", abajo: "text-orchid", nada: "text-muted" };
const BARRA: Record<Tono, string> = { bien: "bg-success", cerca: "bg-warn", abajo: "bg-orchid", nada: "bg-line" };
const PASTILLA: Record<Tono, string> = {
  bien: "bg-success/12 text-success",
  cerca: "bg-warn/12 text-warn",
  abajo: "bg-orchid/12 text-orchid",
  nada: "bg-panel text-muted"
};

function Avance({ valor, t, className }: { valor: number | null; t: Tono; className?: string }) {
  const ancho = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line/60", className)}>
      <motion.div
        className={cn("h-full rounded-full", BARRA[t])}
        initial={{ width: 0 }}
        animate={{ width: `${ancho}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
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
  if (!dias) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-52 rounded-[28px]" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px] rounded-3xl" />)}
      </div>
    );
  }
  if (dias.length === 0) return <Card className="p-4"><p className="text-sm font-semibold text-muted">Todavía no hay días en {periodLabel}.</p></Card>;

  // Día de hoy en el teléfono (en-CA da AAAA-MM-DD): solo ese se resalta.
  const hoyLocal = new Date().toLocaleDateString("en-CA");
  const abrir = (dia: DiaDeVenta) => {
    if (gerencia && dia.personas.length > 0) setAbierto(dia);
  };

  return (
    <>
      <Resumen dias={dias} gerencia={gerencia} onDia={abrir} />
      <div className="mt-3 space-y-2">
        {dias.map((dia) => (
          <FilaDia key={dia.fecha} dia={dia} hoy={dia.fecha === hoyLocal} tocable={gerencia && dia.personas.length > 0} onClick={() => abrir(dia)} />
        ))}
      </div>
      <DetalleDelDia dia={abierto} onClose={() => setAbierto(null)} />
    </>
  );
}

function Resumen({ dias, gerencia, onDia }: { dias: DiaDeVenta[]; gerencia: boolean; onDia: (dia: DiaDeVenta) => void }) {
  const datos = useMemo(() => {
    const capturados = dias.filter((d) => d.capturado);
    const total = capturados.reduce((t, d) => t + d.venta, 0);
    const meta = capturados.reduce((t, d) => t + d.meta, 0);
    const mejor = capturados.reduce<DiaDeVenta | null>((m, d) => (!m || d.venta > m.venta ? d : m), null);
    const cronologico = [...dias].reverse();
    const maximo = Math.max(1, ...cronologico.map((d) => Math.max(d.venta, d.meta)));
    return { capturados, total, meta, mejor, cronologico, maximo };
  }, [dias]);
  const alcance = datos.meta > 0 ? (datos.total / datos.meta) * 100 : null;
  const pocos = datos.cronologico.length <= 10;

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-volt/15 via-transparent to-transparent p-4 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{gerencia ? "Venta de la tienda" : "Tu venta"}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-[28px] font-semibold leading-none tracking-tight text-ink">{money(datos.total)}</p>
          {alcance != null ? (
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", PASTILLA[tono(alcance, true)])}>{Math.round(alcance)}% de la meta</span>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs font-semibold text-muted">
          {datos.capturados.length} de {dias.length} días capturados
          {datos.capturados.length ? ` · promedio ${money(datos.total / datos.capturados.length)}` : ""}
        </p>

        {/* Gráfica: la meta es la sombra de cada barra, la venta el relleno. */}
        <div className="mt-4 flex h-28 items-end gap-1.5" role="img" aria-label="Venta por día">
          {datos.cronologico.map((d) => {
            const t = tono(d.alcance, d.capturado);
            const alto = (Math.max(d.venta, 0) / datos.maximo) * 100;
            const altoMeta = (d.meta / datos.maximo) * 100;
            const tocable = gerencia && d.personas.length > 0;
            return (
              <button
                key={d.fecha}
                type="button"
                disabled={!tocable}
                onClick={() => onDia(d)}
                aria-label={`${diaSemana(d.fecha)} ${diaNumero(d.fecha)}: ${d.capturado ? money(d.venta) : "sin captura"}`}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center disabled:cursor-default"
              >
                {d.meta > 0 ? <span className="absolute bottom-0 w-full rounded-t-md bg-ink/[0.06]" style={{ height: `${altoMeta}%` }} /> : null}
                <motion.span
                  className={cn("relative w-full rounded-t-md", d.capturado ? BARRA[t] : "bg-transparent")}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(alto, d.capturado ? 3 : 0)}%` }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {datos.cronologico.map((d, i) => (
            <span key={d.fecha} className="min-w-0 flex-1 text-center text-[10px] font-semibold text-muted">
              {pocos ? diaSemana(d.fecha).slice(0, 2) : i % 7 === 0 ? diaNumero(d.fecha) : ""}
            </span>
          ))}
        </div>
      </div>
      {datos.mejor ? (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Crown size={14} className="text-warn" /> Mejor día
          </span>
          <span className="text-xs font-semibold text-ink">
            {diaSemana(datos.mejor.fecha)} {diaNumero(datos.mejor.fecha)} · {money(datos.mejor.venta)}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

function FilaDia({ dia, hoy, tocable, onClick }: { dia: DiaDeVenta; hoy: boolean; tocable: boolean; onClick: () => void }) {
  const t = tono(dia.alcance, dia.capturado);
  const contenido = (
    <>
      <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-center", hoy ? "bg-volt text-white" : "bg-panel text-ink")}>
        <div className="leading-none">
          <p className={cn("text-[10px] font-semibold uppercase", hoy ? "text-white/80" : "text-muted")}>{diaSemana(dia.fecha)}</p>
          <p className="mt-0.5 text-lg font-semibold">{diaNumero(dia.fecha)}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("text-base font-semibold", dia.venta < 0 ? "text-orchid" : dia.capturado ? "text-ink" : "text-muted")}>
            {dia.capturado ? money(dia.venta) : "Sin captura"}
          </p>
          {dia.capturado && dia.alcance != null ? (
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", PASTILLA[t])}>{Math.round(dia.alcance)}%</span>
          ) : null}
        </div>
        <Avance valor={dia.alcance} t={t} className="mt-1.5" />
        <p className="mt-1.5 truncate text-[11px] font-semibold text-muted">
          {dia.capturado ? ticketsYPiezas(dia.tickets, dia.piezas) : mesCorto(dia.fecha)}
          {dia.meta > 0 ? ` · meta ${money(dia.meta)}` : ""}
        </p>
      </div>
      {tocable ? <ChevronRight size={18} className="shrink-0 text-muted" /> : null}
    </>
  );
  const clase = "flex w-full items-center gap-3 rounded-3xl border border-line bg-white p-3 text-left shadow-sm dark:bg-panel/60";
  return tocable ? (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onClick} className={cn("tappable", clase)}>
      {contenido}
    </motion.button>
  ) : (
    <div className={clase}>{contenido}</div>
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
            <div className="pointer-events-none fixed inset-0 z-70 flex items-end justify-center p-3 pb-[calc(var(--safe-bottom,0px)+12px)] sm:items-center">
              <Dialog.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 30 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="pointer-events-auto relative flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-line bg-white shadow-2xl dark:bg-panel"
                  />
                }
              >
                <Encabezado dia={dia} />
                <ul className="space-y-1 overflow-y-auto px-3 pb-3">
                  {dia.personas.map((p, i) => <FilaPersona key={p.userId} p={p} lugar={i + 1} />)}
                </ul>
              </Dialog.Popup>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Encabezado({ dia }: { dia: DiaDeVenta }) {
  const t = tono(dia.alcance, dia.capturado);
  const conversion = dia.trafico ? (dia.tickets / dia.trafico) * 100 : null;
  return (
    <div className="bg-gradient-to-br from-volt/15 via-transparent to-transparent px-5 pb-4 pt-4">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div>
          <Dialog.Title className="text-base font-semibold text-ink">{fechaLarga(dia.fecha)}</Dialog.Title>
          <Dialog.Description className="text-xs font-semibold text-muted">Venta de la tienda</Dialog.Description>
        </div>
        <Dialog.Close aria-label="Cerrar" className="tappable grid size-9 shrink-0 place-items-center rounded-full bg-panel text-muted">
          <X size={18} />
        </Dialog.Close>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={cn("text-[28px] font-semibold leading-none tracking-tight", dia.venta < 0 ? "text-orchid" : "text-ink")}>{money(dia.venta)}</p>
        {dia.alcance != null ? <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", PASTILLA[t])}>{Math.round(dia.alcance)}%</span> : null}
      </div>
      <Avance valor={dia.alcance} t={t} className="mt-2.5 h-2" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Dato icono={<Receipt size={14} />} valor={String(dia.tickets)} etiqueta="tickets" />
        <Dato icono={<Shirt size={14} />} valor={String(dia.piezas)} etiqueta="piezas" />
        <Dato icono={<Users size={14} />} valor={conversion != null ? `${conversion.toFixed(1)}%` : "—"} etiqueta="conversión" />
      </div>
    </div>
  );
}

function Dato({ icono, valor, etiqueta }: { icono: React.ReactNode; valor: string; etiqueta: string }) {
  return (
    <div className="rounded-2xl bg-panel/80 px-2.5 py-2 dark:bg-ink/5">
      <p className="flex items-center gap-1 text-muted">{icono}<span className="text-[10px] font-semibold uppercase tracking-wide">{etiqueta}</span></p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{valor}</p>
    </div>
  );
}

function FilaPersona({ p, lugar }: { p: PersonaDelDia; lugar: number }) {
  const t = tono(p.alcance, p.capturado);
  return (
    <li className="flex items-center gap-3 rounded-2xl p-2">
      <div className="relative">
        <ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size="sm" />
        {lugar === 1 && p.capturado && p.venta > 0 ? (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-warn text-white shadow">
            <Crown size={11} />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-ink">{nombreCorto(p.nombre)}</p>
          <p className={cn("shrink-0 text-sm font-semibold", p.venta < 0 ? "text-orchid" : p.capturado ? "text-ink" : "text-muted")}>
            {p.capturado ? money(p.venta) : "—"}
          </p>
        </div>
        <Avance valor={p.alcance} t={t} className="mt-1" />
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-muted">
          <span className="truncate">{p.capturado ? ticketsYPiezas(p.tickets, p.piezas) : "Sin captura"}{p.meta > 0 ? ` · meta ${money(p.meta)}` : ""}</span>
          {p.capturado && p.alcance != null ? <span className={TEXTO[t]}>{Math.round(p.alcance)}%</span> : null}
        </div>
      </div>
    </li>
  );
}
