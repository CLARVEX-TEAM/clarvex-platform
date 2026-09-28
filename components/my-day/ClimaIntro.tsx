"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ambienteDe } from "@/lib/clima";
import type { AmbienteClima, Clima, IconoClima } from "@/lib/clima";

const STORE_TIME_ZONE = "America/Monterrey";

/** Cuánto se queda quieto antes de empezar a irse. */
const VISIBLE_MS = 1600;
/** Lo que dura el desvanecido. */
const SALIDA_MS = 520;

const ICONOS: Record<IconoClima, LucideIcon> = {
  despejado: Sun,
  "algo-nublado": CloudSun,
  nublado: Cloud,
  niebla: CloudFog,
  llovizna: CloudDrizzle,
  lluvia: CloudRain,
  aguacero: CloudRain,
  nieve: CloudSnow,
  tormenta: CloudLightning
};

/**
 * Qué dibujo toca en PEQUEÑO.
 *
 * ⚠️ La hora solo cambia el cielo DESPEJADO: de día es el sol y de noche la
 * luna. Una nube, la lluvia o una tormenta se dibujan igual a cualquier hora, y
 * una «luna con lluvia» no existe en el juego de iconos.
 */
function iconoDe(clima: Clima): LucideIcon {
  if (clima.icono === "despejado") return clima.esDeDia ? Sun : Moon;
  return ICONOS[clima.icono] ?? Cloud;
}

function hora(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: STORE_TIME_ZONE
  }).format(date);
}

function fecha(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: STORE_TIME_ZONE }).format(date);
}

function diaCorto(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: STORE_TIME_ZONE })
    .format(date)
    .replace(".", "")
    .toUpperCase();
}

/* ------------------------------------------------------------------------- *
 * La escena: lo que se mueve detrás del texto.
 * ------------------------------------------------------------------------- */

/**
 * ⚠️ Las posiciones se DERIVAN del índice, no salen de `Math.random()`.
 *
 * Con azar, el servidor y el navegador pintan gotas en sitios distintos y React
 * avisa de que la hidratación no coincide; además cada repintado las movería.
 * Los números primos reparten sin alinearlas en columnas, que es lo único que
 * se le pedía al azar.
 */
function reparto(indice: number, total: number) {
  return {
    izquierda: `${((indice * 37) % 97) + 1}%`,
    retraso: `${((indice * 53) % 900) / 1000}s`,
    duracion: `${0.85 + ((indice * 29) % 60) / 100}s`,
    opacidad: 0.45 + ((indice * 17) % 50) / 100,
    escala: indice % 3 === 0 ? 1.15 : 1,
    total
  };
}

/** Una nube, compuesta de círculos: una curva a mano se deforma al escalarla. */
function Nube({ className, style, color }: { className?: string; style?: React.CSSProperties; color: string }) {
  return (
    <svg viewBox="0 0 70 40" className={className} style={style} fill={color} aria-hidden>
      <circle cx="19" cy="23" r="11" />
      <circle cx="35" cy="17" r="14" />
      <circle cx="52" cy="24" r="10" />
      <rect x="17" y="25" width="38" height="13" rx="6.5" />
    </svg>
  );
}

function Sol({ acento }: { acento: string }) {
  return (
    <span className="absolute right-[-14px] top-[14%] size-[190px]">
      {/* El halo va aparte y quieto: girándolo con los rayos se notaría el
          borde del degradado dando vueltas, que es justo lo que delata un
          truco. */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, ${acento}55 0%, ${acento}00 62%)` }}
      />
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden>
        <g
          className="clima-anim"
          style={{ animation: "clima-girar 26s linear infinite", transformOrigin: "60px 60px" }}
        >
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={i}
              x="58.5"
              y="6"
              width="3"
              height="15"
              rx="1.5"
              fill={acento}
              opacity="0.85"
              transform={`rotate(${i * 45} 60 60)`}
            />
          ))}
        </g>
        <circle
          cx="60"
          cy="60"
          r="27"
          fill={acento}
          className="clima-anim"
          style={{ animation: "clima-latir 4.5s ease-in-out infinite", transformOrigin: "60px 60px" }}
        />
      </svg>
    </span>
  );
}

function Luna({ acento }: { acento: string }) {
  return (
    <span className="absolute right-[-6px] top-[14%] size-[170px]">
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle, ${acento}33 0%, ${acento}00 60%)` }}
      />
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden>
        {/* La luna es un círculo con otro encima del color del fondo: una
            media luna dibujada a mano nunca queda con el mismo grosor. */}
        <mask id="clarvex-luna">
          <rect width="120" height="120" fill="#000" />
          <circle cx="62" cy="58" r="30" fill="#fff" />
          <circle cx="47" cy="47" r="27" fill="#000" />
        </mask>
        <circle
          cx="60"
          cy="60"
          r="46"
          fill={acento}
          mask="url(#clarvex-luna)"
          className="clima-anim"
          style={{ animation: "clima-latir 7s ease-in-out infinite", transformOrigin: "60px 60px" }}
        />
        {[
          [22, 26, 2.2],
          [96, 34, 1.6],
          [34, 92, 1.9],
          [88, 88, 1.4],
          [14, 62, 1.5]
        ].map(([cx, cy, r], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="#FFFFFF"
            className="clima-anim"
            style={{ animation: `clima-brillar ${2.4 + i * 0.6}s ease-in-out infinite`, animationDelay: `${i * 0.37}s` }}
          />
        ))}
      </svg>
    </span>
  );
}

/** Las nubes que cruzan. Sirven solas y también de techo de la lluvia. */
function Nubes({ color, cuantas }: { color: string; cuantas: number }) {
  return (
    <>
      {Array.from({ length: cuantas }, (_, i) => (
        <Nube
          key={i}
          color={color}
          className="clima-anim absolute"
          style={{
            top: `${8 + i * 17}%`,
            width: `${78 + i * 26}px`,
            opacity: 0.16 + i * 0.07,
            animation: `clima-derivar ${34 - i * 6}s linear infinite`,
            animationDelay: `${i * -9}s`
          }}
        />
      ))}
    </>
  );
}

function Caida({ ambiente }: { ambiente: AmbienteClima }) {
  const nieve = ambiente.efecto === "nieve";
  return (
    <>
      {Array.from({ length: ambiente.intensidad }, (_, i) => {
        const r = reparto(i, ambiente.intensidad);
        return (
          <span
            key={i}
            aria-hidden
            className="clima-anim absolute top-0"
            style={{
              left: r.izquierda,
              width: nieve ? `${4 * r.escala}px` : "2px",
              height: nieve ? `${4 * r.escala}px` : `${13 * r.escala}px`,
              borderRadius: nieve ? "9999px" : "9999px",
              background: ambiente.acento,
              opacity: r.opacidad,
              animation: `${nieve ? "clima-copo" : "clima-gota"} ${nieve ? "4.6s" : r.duracion} linear infinite`,
              animationDelay: r.retraso
            }}
          />
        );
      })}
    </>
  );
}

function Escena({ ambiente }: { ambiente: AmbienteClima }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {ambiente.efecto === "sol" ? <Sol acento={ambiente.acento} /> : null}
      {ambiente.efecto === "luna" ? <Luna acento={ambiente.acento} /> : null}

      {ambiente.efecto === "nubes" ? <Nubes color="#FFFFFF" cuantas={ambiente.intensidad} /> : null}

      {ambiente.efecto === "niebla"
        ? Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className="clima-anim absolute left-[-10%] h-[14px] w-[120%] rounded-full bg-white/25 blur-[6px]"
              style={{
                top: `${16 + i * 15}%`,
                animation: `clima-banda ${7 + i * 1.6}s ease-in-out infinite`,
                animationDelay: `${i * -1.4}s`
              }}
            />
          ))
        : null}

      {ambiente.efecto === "lluvia" || ambiente.efecto === "nieve" || ambiente.efecto === "tormenta" ? (
        <>
          <Nubes color="#FFFFFF" cuantas={2} />
          <Caida ambiente={ambiente} />
        </>
      ) : null}

      {ambiente.efecto === "tormenta" ? (
        <>
          {/* El destello cubre la tarjeta entera: un relámpago que solo ilumina
              su propio dibujo no parece un relámpago. */}
          <span
            className="clima-anim absolute inset-0"
            style={{ background: `linear-gradient(180deg,${ambiente.acento}66,transparent 60%)`, animation: "clima-destello 7s linear infinite" }}
          />
          <svg viewBox="0 0 40 70" className="clima-anim absolute right-8 top-[28%] h-[86px]" aria-hidden
            style={{ animation: "clima-destello 7s linear infinite", animationDelay: "0.05s" }}>
            <path d="M24 2 L8 38 h11 L14 68 L33 28 H21 z" fill={ambiente.acento} />
          </svg>
        </>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------------- *
 * La entrada.
 * ------------------------------------------------------------------------- */

/**
 * La bienvenida con el clima, encima del recuadro de «Mi día».
 *
 * ⚠️ **Va DENTRO del recuadro, no encima de la pantalla.** Se monta como hijo
 * de la tarjeta del degradado y se estira con `inset-0`, así que hereda su
 * tamaño exacto y sus esquinas. Colgada del contenedor de fuera --que es donde
 * estaba-- tapaba también el saludo y el clima pequeño, y salía una tarjeta
 * enorme que no correspondía a ningún recuadro de la pantalla: el bloque azul
 * empezaba por encima de «Hola» y terminaba donde no debía.
 *
 * ⚠️ **Y no puede retrasar lo que se vino a ver.** Dura poco más de dos
 * segundos, se salta entera con `prefers-reduced-motion`, y si el clima no
 * llegó no se monta: nadie espera por un adorno. La información tampoco se
 * pierde al irse --la temperatura se queda en pequeño arriba--, así que esto es
 * la presentación del dato, no la única forma de verlo.
 */
export function ClimaIntro({ clima, ciudad, onTerminar }: { clima: Clima; ciudad: string; onTerminar: () => void }) {
  const [saliendo, setSaliendo] = useState(false);
  const [ahora] = useState(() => new Date());

  useEffect(() => {
    // Quien pidió menos movimiento no ve la entrada: se avisa de que terminó en
    // el mismo tick y el recuadro queda a la vista sin animación ninguna.
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (sinMovimiento) {
      onTerminar();
      return;
    }
    const aSalir = window.setTimeout(() => setSaliendo(true), VISIBLE_MS);
    const aQuitar = window.setTimeout(onTerminar, VISIBLE_MS + SALIDA_MS);
    return () => {
      window.clearTimeout(aSalir);
      window.clearTimeout(aQuitar);
    };
  }, [onTerminar]);

  const ambiente = ambienteDe(clima);
  const grados = `${clima.temperatura > 0 ? "+" : ""}${clima.temperatura}°`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between overflow-hidden rounded-[26px] px-6 py-6 text-white transition-all ease-out"
      style={{
        opacity: saliendo ? 0 : 1,
        transform: saliendo ? "scale(1.04)" : "scale(1)",
        transitionDuration: `${SALIDA_MS}ms`,
        background: ambiente.fondo
      }}
    >
      <Escena ambiente={ambiente} />

      <div className="relative flex items-baseline justify-between gap-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">{ciudad}</p>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-white/90">{hora(ahora)}</p>
      </div>

      <div className="relative">
        <p className="text-[3.4rem] font-semibold leading-none tracking-[-0.045em] tabular-nums drop-shadow-[0_2px_12px_rgb(0_0_0/0.25)]">
          {grados}
        </p>
        <p className="mt-2 text-[15px] font-medium text-white/90">{clima.descripcion}</p>
      </div>

      <p className="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-white/65">
        {diaCorto(ahora)} · {fecha(ahora)}
      </p>
    </div>
  );
}

/**
 * La versión que se QUEDA: dos datos en una línea, sobre el papel.
 *
 * ⚠️ El icono va en `acentoPapel`, NO en el color del dibujo grande. Vive sobre
 * el fondo crema, no sobre el degradado: el sol estaba pintado de un azul
 * clarísimo --bueno sobre azul marino, invisible sobre crema-- y por eso se
 * veían los grados sin nada al lado.
 */
export function ClimaChip({ clima }: { clima: Clima }) {
  const Icono = iconoDe(clima);
  const { acentoPapel } = ambienteDe(clima);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-volt/8 px-2.5 py-1 text-xs font-semibold tabular-nums text-ink">
      <Icono size={14} strokeWidth={2.4} className="shrink-0" style={{ color: acentoPapel }} />
      <span className="shrink-0">{clima.temperatura}°</span>
      {/* «Parcialmente nublado» no cabe en una pantalla estrecha junto al
          nombre: se recorta en vez de empujar el chip fuera de su sitio. */}
      <span className="truncate font-medium text-muted">{clima.descripcion}</span>
    </span>
  );
}
