"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Clock3, Expand, Minimize, Percent, Receipt, Shirt, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import Image from "next/image";
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
 * laptop. Fondo claro y tonos pastel (elegido por Adrián el 11 nov 2026), cifras
 * grandes y tabulares, reloj al segundo, ritmo esperado a esa hora, podio y
 * cinta de titulares.
 *
 * Se pide cada 2 segundos (también por Adrián): la venta se ve en cuanto se
 * captura. Una sola petición a la vez, y ninguna con la pestaña oculta.
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

const REFRESCO_MS = 2_000;
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

/** Pastel de fondo, tono medio de la barra y tono fuerte del texto, por estado. */
const TONOS = {
  bien: { fondo: "bg-[#DDF5EA]", barra: "bg-[#5CC99A]", texto: "text-[#1F8A5B]", hex: "#5CC99A" },
  cerca: { fondo: "bg-[#FFF1D6]", barra: "bg-[#F6BE5B]", texto: "text-[#B7791F]", hex: "#F6BE5B" },
  abajo: { fondo: "bg-[#FFE3E6]", barra: "bg-[#F38C9A]", texto: "text-[#C2455A]", hex: "#F38C9A" },
  nada: { fondo: "bg-[#EEF0F4]", barra: "bg-[#C9CEDA]", texto: "text-[#8A90A2]", hex: "#C9CEDA" }
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
  const enCurso = useRef(false);

  const cargar = useCallback(async () => {
    // Cada 2 s: si la anterior sigue en camino o la pestaña está oculta, se salta.
    if (enCurso.current || document.visibilityState === "hidden") return;
    enCurso.current = true;
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
    } finally {
      enCurso.current = false;
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
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#F7F5F1] font-sans text-[#1F2433] antialiased [color-scheme:light]">
      <Confetti show={festejo} />
      {/* Manchas pastel suaves al fondo. */}
      <div className="pointer-events-none fixed -left-40 -top-40 size-[520px] rounded-full bg-[#E9E3FF] opacity-70 blur-3xl" />
      <div className="pointer-events-none fixed -right-32 top-1/3 size-[460px] rounded-full bg-[#DCEEFF] opacity-70 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 left-1/3 size-[520px] rounded-full bg-[#FFE6D6] opacity-60 blur-3xl" />

      <div className="relative mx-auto flex min-h-full max-w-[1920px] flex-col gap-4 p-4 lg:gap-5 lg:p-6 2xl:p-8">
        <Encabezado datos={datos} ahora={ahora} error={error} completa={completa} onCompleta={alternarCompleta} />

        {!datos ? (
          <div className="grid flex-1 place-items-center text-[#8A90A2]">{error ?? "Conectando con la venta de hoy…"}</div>
        ) : (
          <>
            <div className="grid flex-1 gap-4 lg:gap-5 xl:grid-cols-12">
              <div className="flex flex-col gap-4 lg:gap-5 xl:col-span-7">
                <VentaDeHoy venta={venta} meta={meta} alcance={hoy?.alcance ?? null} ritmo={ritmo} vsRitmo={vsRitmo} subida={subidaVisible} ahora={ahora} />
                <Indicadores hoy={hoy} falta={Math.max(0, meta - venta)} />
              </div>
              <div className="flex flex-col gap-4 lg:gap-5 xl:col-span-5">
                <Podio hoy={hoy} />
                <Semana semana={datos.semana} hoyIso={datos.fecha} />
              </div>
            </div>
            <Cinta datos={datos} vsRitmo={vsRitmo} />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function Tarjeta({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("relative overflow-hidden rounded-[28px] bg-white/85 shadow-[0_10px_40px_-12px_rgba(31,36,51,0.12)] ring-1 ring-[#1F2433]/[0.04] backdrop-blur", className)}>{children}</section>;
}

function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-semibold uppercase tracking-[0.18em] text-[#8A90A2]", className)}>{children}</p>;
}

function Encabezado({ datos, ahora, error, completa, onCompleta }: { datos: Respuesta | null; ahora: number; error: string | null; completa: boolean; onCompleta: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white/80 px-4 py-3 shadow-[0_6px_24px_-12px_rgba(31,36,51,0.15)] ring-1 ring-[#1F2433]/[0.04] backdrop-blur lg:px-5">
      <div className="flex items-center gap-3">
        <Link href="/escritorio" aria-label="Salir del panel" className="grid size-10 place-items-center rounded-full bg-[#F1EFEA] text-[#5B6175] transition hover:bg-[#E9E6DF]">
          <ArrowLeft size={18} />
        </Link>
        <div className="relative size-11 shrink-0 overflow-hidden rounded-2xl shadow-[0_4px_14px_-4px_rgba(37,99,235,0.45)]">
          {/* El logo de marca real, el mismo de la barra del escritorio. */}
          <Image src="/icon-512.png" alt="Clarvex" fill sizes="44px" priority className="object-cover" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7C6CF2]">Venta en vivo</p>
          <p className="text-lg font-semibold leading-tight lg:text-xl">{datos?.tienda ?? "Tu tienda"}</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em]", error ? "bg-[#FFF1D6] text-[#B7791F]" : "bg-[#FFE3E6] text-[#C2455A]")}>
          <span className="relative flex size-2.5">
            <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", error ? "bg-[#F6BE5B]" : "bg-[#F38C9A]")} />
            <span className={cn("relative inline-flex size-2.5 rounded-full", error ? "bg-[#F6BE5B]" : "bg-[#E8566C]")} />
          </span>
          {error ? "Reconectando" : "En vivo"}
        </span>
        <span className="hidden items-center gap-1.5 text-sm text-[#5B6175] md:flex">
          <Clock3 size={15} /> {error ?? ultimaCaptura(datos?.actualizado ?? null, ahora)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight lg:text-4xl">{RELOJ.format(new Date(ahora))}</p>
          <p className="text-xs text-[#8A90A2]">{datos ? mayuscula(FECHA.format(new Date(`${datos.fecha}T00:00:00Z`))) : ""}</p>
        </div>
        <button type="button" onClick={onCompleta} aria-label={completa ? "Salir de pantalla completa" : "Pantalla completa"} className="grid size-10 place-items-center rounded-full bg-[#F1EFEA] text-[#5B6175] transition hover:bg-[#E9E6DF]">
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

function VentaDeHoy({ venta, meta, alcance, ritmo, vsRitmo, subida, ahora }: { venta: number; meta: number; alcance: number | null; ritmo: number; vsRitmo: number | null; subida: { monto: number } | null; ahora: number }) {
  const tono = tonoDe(alcance, venta !== 0);
  const t = TONOS[tono];
  const lleno = Math.max(0, Math.min(100, alcance ?? 0));
  const marca = Math.max(0, Math.min(100, ritmo * 100));
  return (
    <Tarjeta className="bg-gradient-to-br from-[#F1EDFF] via-white to-[#EAF6FF] p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <Rotulo>Venta de hoy</Rotulo>
          <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
            <Cifra valor={venta} className="text-[clamp(52px,5.6vw,140px)] font-bold leading-[0.95] tracking-tight" />
            <AnimatePresence>
              {subida ? (
                <motion.span
                  key={subida.monto}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="mb-3 flex items-center gap-1.5 rounded-full bg-[#DDF5EA] px-3.5 py-1.5 text-lg font-semibold text-[#1F8A5B]"
                >
                  <TrendingUp size={18} /> +{sinCentavos(subida.monto)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
          <p className="mt-3 text-lg text-[#5B6175]">
            {meta > 0 ? (
              <>Meta <span className="font-semibold text-[#1F2433]">{sinCentavos(meta)}</span> · {venta >= meta ? <span className="font-semibold text-[#1F8A5B]">¡meta del día lograda! 🎉</span> : <>faltan <span className="font-semibold text-[#1F2433]">{sinCentavos(meta - venta)}</span></>}</>
            ) : "Sin meta capturada para hoy"}
          </p>
        </div>
        <Medidor valor={alcance} tono={tono} />
      </div>

      {/* La barra del día: relleno = venta; la marca = dónde «debería» ir a esta hora. */}
      <div className="mt-10">
        <div className="relative h-6 rounded-full bg-[#EEF0F4]">
          <motion.div
            className={cn("absolute inset-y-0 left-0 rounded-full", t.barra)}
            initial={{ width: 0 }}
            animate={{ width: `${lleno}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
          {meta > 0 && marca > 0 && marca < 100 ? (
            <div className="absolute -bottom-1.5 -top-1.5 w-1 -translate-x-1/2 rounded-full bg-[#7C6CF2]" style={{ left: `${marca}%` }}>
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#7C6CF2] px-2 py-0.5 text-[11px] font-semibold text-white">
                ritmo {HORA_CORTA.format(new Date(ahora))}
              </span>
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[#8A90A2]">
            {ritmo <= 0 ? "La tienda abre a las 11:00: el ritmo empieza a contar a esa hora" : ritmo >= 1 ? "Tienda cerrada: así terminó el día" : `Ritmo estimado: a esta hora se espera el ${Math.round(ritmo * 100)} % de la meta`}
          </span>
          {vsRitmo != null && venta !== 0 ? (
            <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold", vsRitmo >= 0 ? "bg-[#DDF5EA] text-[#1F8A5B]" : "bg-[#FFE3E6] text-[#C2455A]")}>
              {vsRitmo >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {vsRitmo >= 0 ? `${sinCentavos(vsRitmo)} arriba del ritmo` : `${sinCentavos(-vsRitmo)} abajo del ritmo`}
            </span>
          ) : null}
        </div>
      </div>
    </Tarjeta>
  );
}

/** Una cifra de dinero que «sube» cuando cambia, y se tiñe de verde un momento. */
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
  return <p className={cn("tabular-nums transition-colors duration-700", subio ? "text-[#1F8A5B]" : valor < 0 ? "text-[#C2455A]" : "text-[#1F2433]", className)}>{money(mostrado)}</p>;
}

/** Medio círculo, como un velocímetro: más fácil de leer de lejos que un anillo. */
function Medidor({ valor, tono }: { valor: number | null; tono: Tono }) {
  const t = TONOS[tono];
  const lleno = Math.max(0, Math.min(100, valor ?? 0));
  const largo = Math.PI * 80;
  return (
    <div className={cn("relative flex w-48 shrink-0 flex-col items-center rounded-[24px] px-4 pb-4 pt-5 2xl:w-64", t.fondo)}>
      <svg viewBox="0 0 200 110" className="w-full">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="18" strokeLinecap="round" />
        <motion.path
          d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={t.hex} strokeWidth="18" strokeLinecap="round" strokeDasharray={largo}
          initial={{ strokeDashoffset: largo }} animate={{ strokeDashoffset: largo - (lleno / 100) * largo }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <p className={cn("-mt-8 text-4xl font-bold tabular-nums 2xl:-mt-9 2xl:text-6xl", t.texto)}>{valor == null ? "—" : `${Math.round(valor)}%`}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5B6175]">de la meta del día</p>
    </div>
  );
}

function Indicadores({ hoy, falta }: { hoy: DiaDeVenta | null; falta: number }) {
  const tickets = hoy?.tickets ?? 0;
  const piezas = hoy?.piezas ?? 0;
  const venta = hoy?.capturado ? hoy.venta : 0;
  const items = [
    { etiqueta: "Tickets", valor: String(tickets), icono: Receipt, fondo: "bg-[#DCEEFF]", tinta: "text-[#2F6FB3]" },
    { etiqueta: "Piezas", valor: String(piezas), icono: Shirt, fondo: "bg-[#E9E3FF]", tinta: "text-[#6A55E0]" },
    { etiqueta: "Conversión", valor: hoy?.trafico ? `${((tickets / hoy.trafico) * 100).toFixed(1)}%` : "—", icono: Users, fondo: "bg-[#DDF5EA]", tinta: "text-[#1F8A5B]" },
    { etiqueta: "Ticket prom.", valor: tickets ? sinCentavos(venta / tickets) : "—", icono: Percent, fondo: "bg-[#FFE6D6]", tinta: "text-[#C76A2E]" },
    { etiqueta: "Piezas x ticket", valor: tickets ? (piezas / tickets).toFixed(2) : "—", icono: Shirt, fondo: "bg-[#FFF4C7]", tinta: "text-[#A27C0B]" },
    { etiqueta: "Faltan", valor: hoy && hoy.meta > 0 ? sinCentavos(falta) : "—", icono: Target, fondo: "bg-[#FFE3E6]", tinta: "text-[#C2455A]" }
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
      {items.map((it) => (
        <div key={it.etiqueta} className={cn("rounded-[24px] p-4 2xl:p-5", it.fondo)}>
          <div className={cn("flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]", it.tinta)}>
            <it.icono size={16} /> {it.etiqueta}
          </div>
          <p className="mt-2 truncate text-3xl font-bold tabular-nums tracking-tight 2xl:text-4xl">{it.valor}</p>
        </div>
      ))}
    </div>
  );
}

/** Los tres primeros en podio y el resto en lista. */
function Podio({ hoy }: { hoy: DiaDeVenta | null }) {
  const personas = hoy?.personas ?? [];
  const conVenta = personas.filter((p) => p.capturado && p.venta > 0);
  const podio = conVenta.slice(0, 3);
  const resto = personas.filter((p) => !podio.includes(p));
  // Orden visual del podio: 2.º, 1.º, 3.º
  const orden = [podio[1], podio[0], podio[2]];
  const estilos = [
    { alto: "h-24", fondo: "bg-[#E7EAF1]", medalla: "🥈" },
    { alto: "h-32", fondo: "bg-[#FFF1C9]", medalla: "🥇" },
    { alto: "h-20", fondo: "bg-[#FBE2D2]", medalla: "🥉" }
  ];
  return (
    <Tarjeta className="flex flex-col p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <Rotulo>Ranking de hoy</Rotulo>
        <span className="text-xs text-[#8A90A2]">{personas.length} en piso</span>
      </div>

      {podio.length > 0 ? (
        <div className="grid grid-cols-3 items-end gap-3">
          {orden.map((p, i) =>
            p ? (
              <motion.div key={p.userId} layout className="flex flex-col items-center text-center">
                <span className={cn("mb-1 leading-none", i === 1 ? "text-4xl" : "text-3xl")}>{estilos[i].medalla}</span>
                <ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size={i === 1 ? "lg" : "md"} />
                <p className="mt-2 w-full truncate text-base font-semibold">{nombreCorto(p.nombre)}</p>
                <Cifra valor={p.venta} className={cn("font-bold", i === 1 ? "text-2xl" : "text-xl")} />
                <span className={cn("mt-0.5 text-sm font-semibold", TONOS[tonoDe(p.alcance, p.capturado)].texto)}>{p.alcance != null ? `${Math.round(p.alcance)}%` : ""}</span>
                <div className={cn("mt-2 w-full rounded-t-2xl", estilos[i].alto, estilos[i].fondo)} />
              </motion.div>
            ) : (
              <div key={`vacio-${i}`} />
            )
          )}
        </div>
      ) : (
        <p className="py-10 text-center text-[#8A90A2]">Todavía no hay venta capturada hoy.</p>
      )}

      {resto.length > 0 ? (
        <ul className="mt-4 space-y-2">
          <AnimatePresence initial={false}>
            {resto.map((p) => <Fila key={p.userId} p={p} lugar={personas.indexOf(p) + 1} />)}
          </AnimatePresence>
        </ul>
      ) : null}
    </Tarjeta>
  );
}

function Fila({ p, lugar }: { p: PersonaDelDia; lugar: number }) {
  const t = TONOS[tonoDe(p.alcance, p.capturado)];
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-2xl bg-[#F7F5F1] px-3 py-2.5">
      <span className="w-6 text-center font-semibold tabular-nums text-[#8A90A2]">{lugar}</span>
      <ProfileAvatar name={p.nombre} photoUrl={p.photoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-semibold">{nombreCorto(p.nombre)}</p>
          <p className="shrink-0 font-semibold tabular-nums">{p.capturado ? sinCentavos(p.venta) : "—"}</p>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white">
          <motion.div className={cn("h-full rounded-full", t.barra)} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, p.alcance ?? 0))}%` }} transition={{ duration: 0.9 }} />
        </div>
      </div>
      <span className={cn("w-12 text-right text-sm font-semibold tabular-nums", t.texto)}>{p.capturado && p.alcance != null ? `${Math.round(p.alcance)}%` : ""}</span>
    </motion.li>
  );
}

function Semana({ semana, hoyIso }: { semana: Respuesta["semana"]; hoyIso: string }) {
  const maximo = useMemo(() => Math.max(1, ...semana.dias.map((d) => Math.max(d.venta, d.meta))), [semana.dias]);
  const alcance = semana.meta > 0 ? (semana.venta / semana.meta) * 100 : null;
  const t = TONOS[tonoDe(alcance)];
  return (
    <Tarjeta className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Rotulo>Semana hasta hoy</Rotulo>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{sinCentavos(semana.venta)}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-lg font-bold tabular-nums", t.fondo, t.texto)}>{alcance == null ? "—" : `${Math.round(alcance)}%`}</span>
      </div>
      <div className="mt-5 grid h-32 grid-cols-7 items-end gap-2.5">
        {Array.from({ length: 7 }, (_, i) => {
          const fecha = new Date(new Date(`${semana.inicio}T00:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10);
          const d = semana.dias.find((x) => x.fecha === fecha);
          const td = TONOS[tonoDe(d && d.meta > 0 ? (d.venta / d.meta) * 100 : null, Boolean(d?.capturado))];
          const esHoy = fecha === hoyIso;
          return (
            <div key={fecha} className="flex h-full flex-col items-center gap-1.5">
              <div className="relative w-full flex-1">
                {d && d.meta > 0 ? <span className="absolute inset-x-0 bottom-0 rounded-xl bg-[#EEF0F4]" style={{ height: `${(d.meta / maximo) * 100}%` }} /> : null}
                {d?.capturado ? (
                  <motion.span
                    className={cn("absolute inset-x-1 bottom-0 rounded-xl", td.barra)}
                    initial={{ height: 0 }}
                    animate={{ height: `${(Math.max(d.venta, 0) / maximo) * 100}%` }}
                    transition={{ duration: 0.9, delay: i * 0.05 }}
                  />
                ) : null}
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold uppercase", esHoy ? "bg-[#7C6CF2] text-white" : "text-[#8A90A2]")}>
                {DIA_CORTO.format(new Date(`${fecha}T00:00:00Z`)).replace(/\./g, "").slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

/** La cinta de abajo: titulares que pasan solos. */
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
  const texto = titulares.join("      ·      ");
  return (
    <div className="relative flex items-center overflow-hidden rounded-full bg-white/85 shadow-[0_6px_24px_-12px_rgba(31,36,51,0.15)] ring-1 ring-[#1F2433]/[0.04]">
      <span className="z-10 m-1.5 shrink-0 rounded-full bg-gradient-to-r from-[#B9AEFF] to-[#8FD3FF] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white">Al momento</span>
      <div className="relative flex-1 overflow-hidden py-2.5">
        <motion.div
          className="flex w-max gap-16 whitespace-nowrap text-lg text-[#3A4055]"
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
