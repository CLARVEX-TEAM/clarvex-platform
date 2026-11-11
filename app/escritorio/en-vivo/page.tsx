"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Crown, Expand, Minimize } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confetti } from "@/components/Confetti";
import { ProfileAvatar } from "@/components/ui";
import { money } from "@/lib/format";
import type { DiaDeVenta, PersonaDelDia } from "@/lib/kpi-dias";
import { cn } from "@/lib/utils";

/*
 * «Venta en vivo»: el panel para la tele o la laptop de la tienda en temporada
 * alta. Pantalla completa, siempre oscuro (se ve mejor en una tele y no
 * deslumbra en bodega), se refresca cada 30 s y no deja que la pantalla se
 * apague (Wake Lock).
 *
 * ⚠️ Enseña la venta de TODO el equipo: vive bajo /escritorio, que es solo de
 * gerencia, y su API exige GERENTE o SUBGERENTE. No ponerlo en una tele que
 * vea el público.
 */

type Respuesta = {
  fecha: string;
  hoy: DiaDeVenta | null;
  semana: { inicio: string; venta: number; meta: number; dias: Array<{ fecha: string; venta: number; meta: number; capturado: boolean }> };
  actualizado: string | null;
};

const REFRESCO_MS = 30_000;
const FECHA = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const DIA_CORTO = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const nombreCorto = (n: string) => n.toLowerCase().split(/\s+/).slice(0, 2).map(mayuscula).join(" ");

function tonoDe(alcance: number | null) {
  if (alcance == null) return { texto: "text-white/50", barra: "bg-white/20", anillo: "#64748b" };
  if (alcance >= 100) return { texto: "text-emerald-400", barra: "bg-emerald-400", anillo: "#34d399" };
  if (alcance >= 85) return { texto: "text-amber-400", barra: "bg-amber-400", anillo: "#fbbf24" };
  return { texto: "text-rose-400", barra: "bg-rose-400", anillo: "#fb7185" };
}

function haceCuanto(iso: string | null, ahora: number) {
  if (!iso) return "sin captura hoy";
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "actualizado hace un momento";
  if (min < 60) return `actualizado hace ${min} min`;
  return `actualizado a las ${new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}`;
}

export default function VentaEnVivoPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [completa, setCompleta] = useState(false);
  const [festejo, setFestejo] = useState(false);
  const yaFestejados = useRef<Set<string>>(new Set());
  const primeraCarga = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/en-vivo", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 403 ? "Este panel es solo para gerencia." : "No se pudo actualizar.");
      const j = (await r.json()) as Respuesta;
      setDatos(j);
      setError(null);
      // Confeti cuando alguien (o la tienda) cruza su meta. No al abrir el
      // panel: quien ya iba arriba no es noticia.
      const cruzaron = [
        ...(j.hoy?.alcance != null && j.hoy.alcance >= 100 ? [`tienda-${j.fecha}`] : []),
        ...(j.hoy?.personas ?? []).filter((p) => p.alcance != null && p.alcance >= 100).map((p) => `${p.userId}-${j.fecha}`)
      ];
      const nuevos = cruzaron.filter((c) => !yaFestejados.current.has(c));
      nuevos.forEach((c) => yaFestejados.current.add(c));
      if (nuevos.length && !primeraCarga.current) {
        setFestejo(true);
        setTimeout(() => setFestejo(false), 3000);
      }
      primeraCarga.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = setInterval(() => void cargar(), REFRESCO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    // Al volver a la pestaña, de inmediato: la laptop pudo dormirse.
    const alVolver = () => { if (document.visibilityState === "visible") void cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(id); clearInterval(reloj); document.removeEventListener("visibilitychange", alVolver); };
  }, [cargar]);

  // Que la tele o la laptop no apaguen la pantalla mientras el panel está abierto.
  useEffect(() => {
    let candado: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") candado = await wl.request("screen");
      } catch { /* sin permiso: la pantalla se apaga como siempre */ }
    };
    void pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => { document.removeEventListener("visibilitychange", pedir); void candado?.release().catch(() => undefined); };
  }, []);

  useEffect(() => {
    const cambio = () => setCompleta(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, []);
  const alternarCompleta = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const hoy = datos?.hoy ?? null;
  const tono = tonoDe(hoy?.alcance ?? null);
  const falta = hoy ? Math.max(0, hoy.meta - hoy.venta) : 0;

  // ⚠️ Va en un portal sobre <body>: dentro del escritorio, la barra lateral
  // quedaba encima y tapaba el lado izquierdo del panel.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#07080b] text-white">
      <Confetti show={festejo} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(16,185,129,0.12),transparent_50%)]" />

      <div className="relative mx-auto flex min-h-full max-w-[1600px] flex-col gap-5 p-5 lg:p-8">
        {/* Encabezado */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/escritorio" aria-label="Salir del panel" className="grid size-10 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400">Clarvex · Venta en vivo</p>
              <p className="text-lg font-semibold">{datos ? mayuscula(FECHA.format(new Date(`${datos.fecha}T00:00:00Z`))) : "…"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm text-white/70">
              <span className="relative flex size-2.5">
                <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", error ? "bg-rose-400" : "bg-emerald-400")} />
                <span className={cn("relative inline-flex size-2.5 rounded-full", error ? "bg-rose-400" : "bg-emerald-400")} />
              </span>
              {error ?? haceCuanto(datos?.actualizado ?? null, ahora)}
            </span>
            <button type="button" onClick={alternarCompleta} aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"} className="grid size-10 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10">
              {completa ? <Minimize size={18} /> : <Expand size={18} />}
            </button>
          </div>
        </header>

        {!datos ? (
          <div className="grid flex-1 place-items-center text-white/50">{error ?? "Cargando la venta de hoy…"}</div>
        ) : (
          <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            {/* Hoy, la tienda */}
            <section className="flex flex-col gap-5">
              <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 lg:p-8">
                <div className="flex items-center justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">Venta de hoy</p>
                    <Cifra valor={hoy?.capturado ? hoy.venta : 0} className="mt-2 text-5xl font-semibold tracking-tight lg:text-7xl" />
                    <p className="mt-3 text-base text-white/60 lg:text-lg">
                      {hoy && hoy.meta > 0 ? <>Meta {money(hoy.meta)} · {falta > 0 ? <>faltan <span className="font-semibold text-white">{money(falta)}</span></> : <span className="font-semibold text-emerald-400">¡meta lograda! 🎉</span>}</> : "Sin meta capturada"}
                    </p>
                  </div>
                  <Anillo valor={hoy?.alcance ?? null} color={tono.anillo} />
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <Mini etiqueta="Tickets" valor={String(hoy?.tickets ?? 0)} />
                  <Mini etiqueta="Piezas" valor={String(hoy?.piezas ?? 0)} />
                  <Mini etiqueta="Conversión" valor={hoy?.trafico ? `${((hoy.tickets / hoy.trafico) * 100).toFixed(1)}%` : "—"} />
                </div>
              </div>
              <Semana semana={datos.semana} hoyIso={datos.fecha} />
            </section>

            {/* Hoy, cada quien */}
            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 lg:p-8">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">Ranking de hoy</h2>
                <span className="text-sm text-white/40">{hoy?.personas.length ?? 0} personas</span>
              </div>
              {hoy && hoy.personas.length > 0 ? (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {hoy.personas.map((p, i) => <Persona key={p.userId} p={p} lugar={i + 1} />)}
                  </AnimatePresence>
                </ul>
              ) : (
                <p className="py-16 text-center text-white/40">Todavía no hay venta capturada hoy.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Una cifra de dinero que «sube» cuando cambia, y parpadea en verde. */
function Cifra({ valor, className }: { valor: number; className?: string }) {
  const [mostrado, setMostrado] = useState(valor);
  const [subio, setSubio] = useState(false);
  const anterior = useRef(valor);
  useEffect(() => {
    const desde = anterior.current;
    anterior.current = valor;
    if (desde === valor) return;
    if (valor > desde) { setSubio(true); setTimeout(() => setSubio(false), 1600); }
    const inicio = performance.now();
    let cuadro = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / 900);
      const suave = 1 - Math.pow(1 - k, 3);
      setMostrado(desde + (valor - desde) * suave);
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);
  return <p className={cn("tabular-nums transition-colors duration-700", subio ? "text-emerald-400" : valor < 0 ? "text-rose-400" : "text-white", className)}>{money(mostrado)}</p>;
}

function Anillo({ valor, color }: { valor: number | null; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const lleno = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <div className="relative size-36 shrink-0 lg:size-48">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <motion.circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (lleno / 100) * c }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-semibold tabular-nums lg:text-5xl" style={{ color }}>{valor == null ? "—" : `${Math.round(valor)}%`}</p>
          <p className="text-xs uppercase tracking-widest text-white/40">de la meta</p>
        </div>
      </div>
    </div>
  );
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums lg:text-3xl">{valor}</p>
    </div>
  );
}

function Semana({ semana, hoyIso }: { semana: Respuesta["semana"]; hoyIso: string }) {
  const maximo = useMemo(() => Math.max(1, ...semana.dias.map((d) => Math.max(d.venta, d.meta))), [semana.dias]);
  const alcance = semana.meta > 0 ? (semana.venta / semana.meta) * 100 : null;
  const tono = tonoDe(alcance);
  return (
    <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">Semana hasta hoy</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{money(semana.venta)}</p>
        </div>
        {alcance != null ? <p className={cn("text-2xl font-semibold tabular-nums", tono.texto)}>{Math.round(alcance)}%</p> : null}
      </div>
      <div className="mt-5 flex h-24 items-end gap-2">
        {Array.from({ length: 7 }, (_, i) => {
          const fecha = new Date(new Date(`${semana.inicio}T00:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10);
          const d = semana.dias.find((x) => x.fecha === fecha);
          const t = tonoDe(d && d.meta > 0 ? (d.venta / d.meta) * 100 : null);
          return (
            <div key={fecha} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div className="relative w-full flex-1">
                {d && d.meta > 0 ? <span className="absolute inset-x-0 bottom-0 rounded-t-lg bg-white/[0.06]" style={{ height: `${(d.meta / maximo) * 100}%` }} /> : null}
                {d?.capturado ? (
                  <motion.span className={cn("absolute inset-x-0 bottom-0 rounded-t-lg", t.barra)} initial={{ height: 0 }} animate={{ height: `${(Math.max(d.venta, 0) / maximo) * 100}%` }} transition={{ duration: 0.8 }} />
                ) : null}
              </div>
              <span className={cn("text-xs font-semibold uppercase", fecha === hoyIso ? "text-blue-400" : "text-white/40")}>
                {DIA_CORTO.format(new Date(`${fecha}T00:00:00Z`)).replace(/\./g, "").slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Persona({ p, lugar }: { p: PersonaDelDia; lugar: number }) {
  const tono = tonoDe(p.capturado ? p.alcance : null);
  const lider = lugar === 1 && p.capturado && p.venta > 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn("flex items-center gap-4 rounded-3xl p-4", lider ? "bg-amber-400/10 ring-1 ring-amber-400/30" : "bg-white/[0.03]")}
    >
      <span className={cn("w-7 text-center text-xl font-semibold tabular-nums", lider ? "text-amber-400" : "text-white/30")}>{lider ? <Crown size={22} className="mx-auto" /> : lugar}</span>
      <ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-lg font-semibold lg:text-xl">{nombreCorto(p.nombre)}</p>
          <Cifra valor={p.capturado ? p.venta : 0} className="shrink-0 text-xl font-semibold lg:text-2xl" />
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
          <motion.div className={cn("h-full rounded-full", tono.barra)} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, p.alcance ?? 0))}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <div className="mt-1.5 flex justify-between text-sm text-white/45">
          <span>{p.capturado ? `${p.tickets} tickets · ${p.piezas} piezas` : "Sin captura"}{p.meta > 0 ? ` · meta ${money(p.meta)}` : ""}</span>
          {p.alcance != null && p.capturado ? <span className={cn("font-semibold", tono.texto)}>{Math.round(p.alcance)}%</span> : null}
        </div>
      </div>
    </motion.li>
  );
}
