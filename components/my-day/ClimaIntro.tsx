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
import type { Clima, IconoClima } from "@/lib/clima";

const STORE_TIME_ZONE = "America/Monterrey";

/** Cuánto se queda quieto antes de empezar a irse. */
const VISIBLE_MS = 1200;
/** Lo que dura el desvanecido. */
const SALIDA_MS = 450;

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
 * Qué dibujo toca.
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

/**
 * La bienvenida con el clima, encima del recuadro de «Mi día».
 *
 * ⚠️ **Va SUPERPUESTA, no delante.** El recuadro se pinta desde el primer
 * instante y esto lo tapa mientras dura; al desvanecerse, lo que aparece ya
 * estaba ahí. Ponerla antes haría que la pantalla cambiara de altura al
 * cambiar de una a otro, y un salto de layout al abrir la app se lee como que
 * algo falló.
 *
 * ⚠️ **Y no puede retrasar lo que se vino a ver.** Dura poco más de un segundo
 * y medio, se salta entera con `prefers-reduced-motion`, y si el clima no llegó
 * no se monta: nadie espera por un adorno. La información tampoco se pierde al
 * irse —la temperatura se queda en pequeño dentro del recuadro—, así que esto
 * es la presentación del dato, no la única forma de verlo.
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

  const Dibujo = iconoDe(clima);
  const grados = `${clima.temperatura > 0 ? "+" : ""}${clima.temperatura}°C`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between overflow-hidden rounded-[26px] px-5 py-5 text-white transition-all ease-out"
      style={{
        opacity: saliendo ? 0 : 1,
        transform: saliendo ? "scale(1.03)" : "scale(1)",
        transitionDuration: `${SALIDA_MS}ms`,
        background: clima.esDeDia
          ? "linear-gradient(135deg,#1E4FA8 0%,#3E86E8 55%,#7FC0FF 130%)"
          : "linear-gradient(135deg,#050B1C 0%,#132A5E 60%,#2A4E9E 130%)"
      }}
    >
      {/*
        El dibujo va detrás y grande, ocupando el alto que el recuadro tiene de
        sobra. Con el contenido centrado en una sola línea, la tarjeta quedaba
        medio vacía arriba y abajo.
      */}
      <span aria-hidden className="absolute -right-3 top-1/2 -translate-y-1/2 text-white/20">
        <Dibujo size={132} strokeWidth={1.1} />
      </span>

      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">{ciudad}</p>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-white/90">{hora(ahora)}</p>
      </div>

      <div className="relative">
        <p className="text-[2.6rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{grados}</p>
        <p className="mt-1.5 text-sm font-medium text-white/85">{clima.descripcion}</p>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
        {diaCorto(ahora)} · {fecha(ahora)}
      </p>
    </div>
  );
}

/** La versión que se QUEDA: dos datos en una línea, dentro del recuadro. */
export function ClimaChip({ clima }: { clima: Clima }) {
  const Icono = iconoDe(clima);
  return (
    <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-blue-50">
      <Icono size={14} className="text-sky-200" />
      {clima.temperatura}°
    </span>
  );
}
