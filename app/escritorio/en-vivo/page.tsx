"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Crown, Expand, Minimize, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confetti } from "@/components/Confetti";
import { ProfileAvatar } from "@/components/ui";
import { money } from "@/lib/format";
import type { DiaDeVenta, PersonaDelDia } from "@/lib/kpi-dias";
import { APERTURA_MIN, contraElRitmo, ritmoEsperado } from "@/lib/venta-ritmo";
import { cn } from "@/lib/utils";

/*
 * «Venta en vivo»: el monitor de la tienda en temporada alta, para la tele o la
 * laptop. Estilo sala de control: siempre oscuro, cifras grandes y tabulares,
 * reloj al segundo, ritmo esperado a esa hora y cinta de noticias.
 *
 * Se refresca cada 30 s, no deja apagar la pantalla (Wake Lock) y celebra con
 * confeti cuando alguien cruza su meta.
 *
 * ⚠️ Enseña la venta de TODO el equipo: vive bajo /escritorio, que es solo de
 * gerencia, y su API exige GERENTE o SUBGERENTE. No ponerlo donde lo vea el
 * público.
 *
 * ⚠️ Va en un portal sobre <body>: dentro del escritorio, la barra lateral
 * quedaba encima y tapaba el lado izquierdo.
 */

type Respuesta = {
  fecha: string;
  tienda: string | null;
  hoy: DiaDeVenta | null;
  semana: { inicio: string; venta: number; meta: number; dias: Array<{ fecha: string; venta: number; meta: number; capturado: boolean }> };
  actualizado: string | null;
};

const REFRESCO_MS = 30_000;
const ZONA = "America/Monterrey";
const FECHA = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const DIA_CORTO = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const RELOJ = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const HORA_CORTA = new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true });
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const nombreCorto = (n: string) => n.toLowerCase().split(/\s+/).slice(0, 2).map(mayuscula).join(" ");
const sinCentavos = (n: number) => money(Math.round(n)).replace(/\.00$/, "");

function minutosMonterrey(ms: number) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)).split(":").map(Number);
  return h * 60 + m;
}

const TONOS = {
  bien: { texto: "text-emerald-300", barra: "from-emerald-500 to-emerald-300", solido: "#34d399", brillo: "shadow-[0_0_24px_rgba(52,211,153,0.35)]" },
  cerca: { texto: "text-amber-300", barra: "from-amber-500 to-amber-300", solido: "#fbbf24", brillo: "shadow-[0_0_24px_rgba(251,191,36,0.3)]" },
  abajo: { texto: "text-rose-300", barra: "from-rose-500 to-rose-300", solido: "#fb7185", brillo: "shadow-[0_0_24px_rgba(251,113,133,0.3)]" },
  nada: { texto: "text-slate-500", barra: "from-slate-600 to-slate-500", solido: "#64748b", brillo: "" }
} as const;
type Tono = keyof typeof TONOS;
function tonoDe(alcance: number | null, capturado = true): Tono {
  if (!capturado || alcance == null) return "nada";
  if (alcance >= 100) return "bien";
  if (alcance >= 85) return "cerca";
  return "abajo";
}

export default function VentaEnVivoPage() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [completa, setCompleta] = useState(false);
  const [festejo, setFestejo] = useState(false);
  const [subida, setSubida] = useState<{ monto: number; en: number } | null>(null);
  const [montado, setMontado] = useState(false);
  const yaFestejados = useRef<Set<string>>(new Set());
  const ventaAnterior = useRef<number | null>(null);
  const primeraCarga = useRef(true);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/en-vivo", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 403 ? "Este panel es solo para gerencia." : "Sin conexión con Clarvex.");
      const j = (await r.json()) as Respuesta;
      setDatos(j);
      setError(null);

      // Lo que subió la tienda desde la captura anterior.
      const venta = j.hoy?.capturado ? j.hoy.venta : 0;
      if (ventaAnterior.current != null && venta > ventaAnterior.current) setSubida({ monto: venta - ventaAnterior.current, en: Date.now() });
      ventaAnterior.current = venta;

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
        setTimeout(() => setFestejo(false), 3500);
      }
      primeraCarga.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sin conexión con Clarvex.");
    }
  }, []);

  useEffect(() => {
    setMontado(true);
    void cargar();
    const id = setInterval(() => void cargar(), REFRESCO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
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

  if (!montado) return null;

  const hoy = datos?.hoy ?? null;
  const venta = hoy?.capturado ? hoy.venta : 0;
  const meta = hoy?.meta ?? 0;
  const minutos = minutosMonterrey(ahora);
  const ritmo = ritmoEsperado(minutos);
  // Antes de abrir no hay ritmo contra qué medir: «$9,816 arriba» a la 1 a.m. no dice nada.
  const vsRitmo = minutos >= APERTURA_MIN ? contraElRitmo(venta, meta, minutos) : null;
  const subidaVisible = subida && ahora - subida.en < 3 * 60_000 ? subida : null;

  return createPortal(
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#04060a] font-sans text-slate-100 antialiased">
      <Confetti show={festejo} />
      {/* Fondo: rejilla fina y dos halos, como un monitor de sala de control. */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,rgba(37,99,235,0.22),transparent),radial-gradient(50%_40%_at_100%_100%,rgba(16,185,129,0.12),transparent)]" />

      <div className="relative mx-auto flex min-h-full max-w-[1920px] flex-col gap-4 p-4 lg:gap-5 lg:p-6 2xl:p-8">
        <BarraSuperior datos={datos} ahora={ahora} error={error} completa={completa} onCompleta={alternarCompleta} />

        {!datos ? (
          <div className="grid flex-1 place-items-center text-slate-500">{error ?? "Conectando con la venta de hoy…"}</div>
        ) : (
          <>
            <div className="grid flex-1 gap-4 lg:gap-5 xl:grid-cols-12">
              <div className="flex flex-col gap-4 lg:gap-5 xl:col-span-8">
                <Hero venta={venta} meta={meta} alcance={hoy?.alcance ?? null} ritmo={ritmo} vsRitmo={vsRitmo} subida={subidaVisible} ahora={ahora} />
                <Indicadores hoy={hoy} falta={Math.max(0, meta - venta)} />
                <Semana semana={datos.semana} hoyIso={datos.fecha} />
              </div>
              <Ranking hoy={hoy} />
            </div>
            <Cinta datos={datos} vsRitmo={vsRitmo} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.015] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm", className)}>
      {children}
    </section>
  );
}

function Etiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400", className)}>{children}</p>;
}

function BarraSuperior({ datos, ahora, error, completa, onCompleta }: { datos: Respuesta | null; ahora: number; error: string | null; completa: boolean; onCompleta: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/escritorio" aria-label="Salir del panel" className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:text-white">
          <ArrowLeft size={18} />
        </Link>
        <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-black shadow-[0_0_20px_rgba(37,99,235,0.5)]">C</div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-400">Clarvex · Sala de ventas</p>
          <p className="text-lg font-semibold leading-tight lg:text-xl">{datos?.tienda ?? "Tu tienda"}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em]", error ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300")}>
          <span className="relative flex size-2.5">
            <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", error ? "bg-amber-400" : "bg-rose-500")} />
            <span className={cn("relative inline-flex size-2.5 rounded-full", error ? "bg-amber-400" : "bg-rose-500")} />
          </span>
          {error ? "Reconectando" : "En vivo"}
        </span>
        <span className="hidden text-sm text-slate-400 md:inline">{error ?? ultimaCaptura(datos?.actualizado ?? null, ahora)}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight lg:text-4xl">{RELOJ.format(new Date(ahora))}</p>
          <p className="text-xs text-slate-400">{datos ? mayuscula(FECHA.format(new Date(`${datos.fecha}T00:00:00Z`))) : ""}</p>
        </div>
        <button type="button" onClick={onCompleta} aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"} className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:text-white">
          {completa ? <Minimize size={18} /> : <Expand size={18} />}
        </button>
      </div>
    </header>
  );
}

function ultimaCaptura(iso: string | null, ahora: number) {
  if (!iso) return "Sin captura hoy";
  const min = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "Última captura: hace un momento";
  if (min < 60) return `Última captura: hace ${min} min`;
  return `Última captura: ${HORA_CORTA.format(new Date(iso))}`;
}

function Hero({ venta, meta, alcance, ritmo, vsRitmo, subida, ahora }: { venta: number; meta: number; alcance: number | null; ritmo: number; vsRitmo: number | null; subida: { monto: number } | null; ahora: number }) {
  const t = TONOS[tonoDe(alcance, venta !== 0)];
  const lleno = Math.max(0, Math.min(100, alcance ?? 0));
  const marca = Math.max(0, Math.min(100, ritmo * 100));
  return (
    <Panel className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <Etiqueta>Venta de hoy</Etiqueta>
          <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-2">
            <Cifra valor={venta} className="text-[clamp(56px,7.5vw,148px)] font-semibold leading-[0.9] tracking-tighter" />
            <AnimatePresence>
              {subida ? (
                <motion.span
                  key={subida.monto}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-2 flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-base font-semibold text-emerald-300 lg:text-lg"
                >
                  <TrendingUp size={18} /> +{sinCentavos(subida.monto)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <p className="mt-3 text-base text-slate-400 lg:text-lg">
            {meta > 0 ? (
              <>Meta <span className="font-semibold text-slate-200">{sinCentavos(meta)}</span> · {venta >= meta ? <span className="font-semibold text-emerald-300">¡meta del día lograda! 🎉</span> : <>faltan <span className="font-semibold text-white">{sinCentavos(meta - venta)}</span></>}</>
            ) : "Sin meta capturada para hoy"}
          </p>
        </div>
        <Anillo valor={alcance} color={t.solido} />
      </div>

      {/* La barra del día: relleno = venta, marca blanca = dónde «debería» ir a esta hora. */}
      <div className="mt-9">
        <div className="relative h-5 rounded-full bg-white/[0.06]">
          <motion.div
            className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", t.barra, t.brillo)}
            initial={{ width: 0 }}
            animate={{ width: `${lleno}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          {meta > 0 && marca > 0 && marca < 100 ? (
            <div className="absolute -top-2 -bottom-2 w-0.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" style={{ left: `${marca}%` }}>
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Ritmo {HORA_CORTA.format(new Date(ahora))}
              </span>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-500">
            {ritmo <= 0 ? "La tienda abre a las 11:00: el ritmo empieza a contar a esa hora" : ritmo >= 1 ? "Tienda cerrada: así terminó el día" : `Ritmo estimado: a esta hora se espera el ${Math.round(ritmo * 100)} % de la meta`}
          </span>
          {vsRitmo != null && venta !== 0 ? (
            <span className={cn("flex items-center gap-1.5 font-semibold", vsRitmo >= 0 ? "text-emerald-300" : "text-rose-300")}>
              {vsRitmo >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {vsRitmo >= 0 ? `${sinCentavos(vsRitmo)} arriba del ritmo` : `${sinCentavos(-vsRitmo)} abajo del ritmo`}
            </span>
          ) : null}
        </div>
      </div>
    </Panel>
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
    if (valor > desde) { setSubio(true); setTimeout(() => setSubio(false), 1800); }
    const inicio = performance.now();
    let cuadro = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / 1100);
      setMostrado(desde + (valor - desde) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);
  return (
    <p className={cn("tabular-nums transition-[color,text-shadow] duration-700", subio ? "text-emerald-300 [text-shadow:0_0_30px_rgba(52,211,153,0.6)]" : valor < 0 ? "text-rose-300" : "text-white", className)}>
      {money(mostrado)}
    </p>
  );
}

function Anillo({ valor, color }: { valor: number | null; color: string }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const lleno = Math.max(0, Math.min(100, valor ?? 0));
  return (
    <div className="relative size-40 shrink-0 2xl:size-52">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" style={{ filter: `drop-shadow(0 0 14px ${color}55)` }}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="11" />
        <motion.circle
          cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (lleno / 100) * c }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-4xl font-semibold tabular-nums 2xl:text-5xl" style={{ color }}>{valor == null ? "—" : `${Math.round(valor)}%`}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">de la meta</p>
        </div>
      </div>
    </div>
  );
}

function Indicadores({ hoy, falta }: { hoy: DiaDeVenta | null; falta: number }) {
  const tickets = hoy?.tickets ?? 0;
  const piezas = hoy?.piezas ?? 0;
  const venta = hoy?.capturado ? hoy.venta : 0;
  const items = [
    { etiqueta: "Tickets", valor: String(tickets) },
    { etiqueta: "Piezas", valor: String(piezas) },
    { etiqueta: "Conversión", valor: hoy?.trafico ? `${((tickets / hoy.trafico) * 100).toFixed(1)}%` : "—" },
    { etiqueta: "Ticket prom.", valor: tickets ? sinCentavos(venta / tickets) : "—" },
    { etiqueta: "Piezas x ticket", valor: tickets ? (piezas / tickets).toFixed(2) : "—" },
    { etiqueta: "Faltan", valor: hoy && hoy.meta > 0 ? sinCentavos(falta) : "—", resalte: falta > 0 }
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4 xl:grid-cols-6">
      {items.map((it) => (
        <Panel key={it.etiqueta} className="px-4 py-3.5 2xl:px-5 2xl:py-4">
          <Etiqueta className="text-[10px]">{it.etiqueta}</Etiqueta>
          <p className={cn("mt-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight 2xl:text-4xl", it.resalte ? "text-amber-200" : "text-white")}>{it.valor}</p>
        </Panel>
      ))}
    </div>
  );
}

function Semana({ semana, hoyIso }: { semana: Respuesta["semana"]; hoyIso: string }) {
  const maximo = useMemo(() => Math.max(1, ...semana.dias.map((d) => Math.max(d.venta, d.meta))), [semana.dias]);
  const alcance = semana.meta > 0 ? (semana.venta / semana.meta) * 100 : null;
  const t = TONOS[tonoDe(alcance)];
  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Etiqueta>Semana hasta hoy</Etiqueta>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight 2xl:text-4xl">{sinCentavos(semana.venta)}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-3xl font-semibold tabular-nums", t.texto)}>{alcance == null ? "—" : `${Math.round(alcance)}%`}</p>
          <p className="text-xs text-slate-500">de {sinCentavos(semana.meta)}</p>
        </div>
      </div>
      <div className="mt-6 grid h-40 grid-cols-7 items-end gap-3">
        {Array.from({ length: 7 }, (_, i) => {
          const fecha = new Date(new Date(`${semana.inicio}T00:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10);
          const d = semana.dias.find((x) => x.fecha === fecha);
          const td = TONOS[tonoDe(d && d.meta > 0 ? (d.venta / d.meta) * 100 : null, Boolean(d?.capturado))];
          const esHoy = fecha === hoyIso;
          return (
            <div key={fecha} className="flex h-full flex-col items-center gap-2">
              <span className="h-4 text-[11px] font-semibold tabular-nums text-slate-400">{d?.capturado ? `${Math.round(d.venta / 1000)}k` : ""}</span>
              <div className="relative w-full flex-1">
                {d && d.meta > 0 ? <span className="absolute inset-x-0 bottom-0 rounded-lg border border-dashed border-white/15 bg-white/[0.03]" style={{ height: `${(d.meta / maximo) * 100}%` }} /> : null}
                {d?.capturado ? (
                  <motion.span
                    className={cn("absolute inset-x-1 bottom-0 rounded-lg bg-gradient-to-t", td.barra, esHoy && td.brillo)}
                    initial={{ height: 0 }}
                    animate={{ height: `${(Math.max(d.venta, 0) / maximo) * 100}%` }}
                    transition={{ duration: 0.9, delay: i * 0.05 }}
                  />
                ) : null}
              </div>
              <span className={cn("text-xs font-semibold uppercase tracking-wider", esHoy ? "text-blue-400" : "text-slate-500")}>
                {DIA_CORTO.format(new Date(`${fecha}T00:00:00Z`)).replace(/\./g, "").slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Ranking({ hoy }: { hoy: DiaDeVenta | null }) {
  const personas = hoy?.personas ?? [];
  return (
    <Panel className="flex flex-col p-6 xl:col-span-4">
      <div className="mb-5 flex items-baseline justify-between">
        <Etiqueta>Ranking de hoy</Etiqueta>
        <span className="text-xs text-slate-500">{personas.length} en piso</span>
      </div>
      {personas.length > 0 ? (
        <ul className="flex flex-1 flex-col gap-3">
          <AnimatePresence initial={false}>
            {personas.map((p, i) => <Persona key={p.userId} p={p} lugar={i + 1} />)}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="grid flex-1 place-items-center py-16 text-center text-slate-500">Todavía no hay venta capturada hoy.</p>
      )}
    </Panel>
  );
}

function Persona({ p, lugar }: { p: PersonaDelDia; lugar: number }) {
  const t = TONOS[tonoDe(p.alcance, p.capturado)];
  const lider = lugar === 1 && p.capturado && p.venta > 0;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4",
        lider ? "border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-transparent shadow-[0_0_30px_rgba(251,191,36,0.15)]" : "border-white/[0.06] bg-white/[0.03]"
      )}
    >
      <span className={cn("w-8 text-center text-2xl font-semibold tabular-nums", lider ? "text-amber-300" : "text-slate-600")}>
        {lider ? <Crown size={26} className="mx-auto" /> : lugar}
      </span>
      <ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-lg font-semibold 2xl:text-xl">{nombreCorto(p.nombre)}</p>
          <Cifra valor={p.capturado ? p.venta : 0} className="shrink-0 text-xl font-semibold 2xl:text-2xl" />
        </div>
        <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            className={cn("h-full rounded-full bg-gradient-to-r", t.barra)}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, p.alcance ?? 0))}%` }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-sm text-slate-400">
          <span className="truncate">{p.capturado ? `${p.tickets} tickets · ${p.piezas} piezas` : "Sin captura"}{p.meta > 0 ? ` · meta ${sinCentavos(p.meta)}` : ""}</span>
          {p.alcance != null && p.capturado ? <span className={cn("font-semibold tabular-nums", t.texto)}>{Math.round(p.alcance)}%</span> : null}
        </div>
      </div>
    </motion.li>
  );
}

/** La cinta de abajo: titulares que pasan solos, como en un monitor de noticias. */
function Cinta({ datos, vsRitmo }: { datos: Respuesta; vsRitmo: number | null }) {
  const titulares = useMemo(() => {
    const hoy = datos.hoy;
    const lista: string[] = [];
    const personas = hoy?.personas ?? [];
    const lider = personas.find((p) => p.capturado && p.venta > 0);
    if (lider) lista.push(`👑 ${nombreCorto(lider.nombre)} lidera el día con ${sinCentavos(lider.venta)}`);
    for (const p of personas) if (p.capturado && p.alcance != null && p.alcance >= 100) lista.push(`🎉 ${nombreCorto(p.nombre)} ya llegó a su meta (${Math.round(p.alcance)}%)`);
    if (hoy && hoy.meta > 0) {
      const venta = hoy.capturado ? hoy.venta : 0;
      lista.push(venta >= hoy.meta ? "🏆 ¡La tienda ya hizo la meta del día!" : `🎯 Faltan ${sinCentavos(hoy.meta - venta)} para la meta de la tienda`);
    }
    if (vsRitmo != null && hoy?.capturado) lista.push(vsRitmo >= 0 ? `📈 Vamos ${sinCentavos(vsRitmo)} arriba del ritmo` : `⏱️ Vamos ${sinCentavos(-vsRitmo)} abajo del ritmo: ¡a cerrar ventas!`);
    const mejor = datos.semana.dias.filter((d) => d.capturado).sort((a, b) => b.venta - a.venta)[0];
    if (mejor) lista.push(`📅 Mejor día de la semana: ${mayuscula(DIA_CORTO.format(new Date(`${mejor.fecha}T00:00:00Z`)).replace(/\./g, ""))} con ${sinCentavos(mejor.venta)}`);
    if (hoy?.tickets) lista.push(`🧾 ${hoy.tickets} tickets y ${hoy.piezas} piezas hoy`);
    return lista.length ? lista : ["Esperando la primera captura del día…"];
  }, [datos, vsRitmo]);
  const texto = titulares.join("     •     ");
  return (
    <div className="relative flex items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-black/40">
      <span className="z-10 shrink-0 bg-blue-600 px-4 py-3 text-xs font-bold uppercase tracking-[0.2em] shadow-[8px_0_16px_rgba(4,6,10,0.9)]">Al momento</span>
      <div className="relative flex-1 overflow-hidden py-3">
        <motion.div
          className="flex w-max gap-16 whitespace-nowrap text-base text-slate-200 lg:text-lg"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: Math.max(25, texto.length * 0.18), ease: "linear", repeat: Infinity }}
        >
          <span>{texto}</span>
          <span aria-hidden>{texto}</span>
        </motion.div>
      </div>
    </div>
  );
}
