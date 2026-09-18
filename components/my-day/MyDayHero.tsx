"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, ReceiptText, ShoppingBag } from "lucide-react";
import { ClimaChip } from "@/components/my-day/ClimaIntro";
import type { Clima } from "@/lib/clima";
import { money } from "@/lib/format";

const STORE_TIME_ZONE = "America/Monterrey";

type Shift = {
  start: string | null;
  end: string | null;
  summary: string;
} | null;

type Performance = {
  sales: number;
  goal: number;
  progress: number;
  transactions: number;
  pieces: number;
};

function localTime(date: Date | null): string {
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: STORE_TIME_ZONE
  }).format(date);
}

function localMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: STORE_TIME_ZONE
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function parsedTime(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function durationLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

function shiftMoment(shift: Shift, now: Date | null): string {
  if (!shift || !now) return shift?.summary ?? "Horario pendiente de cargar";
  const start = parsedTime(shift.start);
  const end = parsedTime(shift.end);
  if (start === null || end === null) return shift.summary;
  const current = localMinutes(now);
  if (current < start) return `Tu turno inicia en ${durationLabel(start - current)}`;
  if (current <= end) return `Tu turno termina en ${durationLabel(end - current)}`;
  return "Turno concluido por hoy";
}

/**
 * El recuadro que abre «Mi día».
 *
 * Rediseñado el 18 de septiembre de 2026, con cuatro problemas concretos del
 * anterior a la vista:
 *
 * 1. ⚠️ **La versión de la app ocupaba la esquina superior derecha**, el segundo
 *    punto más visible de la pantalla, para un dato que solo sirve al dar
 *    soporte. Baja al pie, en pequeño: sigue a mano y deja de competir.
 * 2. ⚠️ **El saludo pesaba más que la venta.** «Hola, Adrián» iba a 2xl y la
 *    cifra del día a 1.75rem: lo que menos informa mandaba sobre lo que más. El
 *    saludo pasa a ser una línea de encabezado y el titular es el TURNO, que es
 *    lo que se mira al abrir la app a media jornada.
 * 3. ⚠️ **El turno salía dos veces** --el resumen arriba y la cuenta regresiva
 *    abajo--, diciendo casi lo mismo con dos redacciones distintas. Queda una.
 * 4. ⚠️ **Con la meta sin cargar pintaba 0 % y una barra vacía**, que se lee
 *    como «vas malísimo» cuando en realidad no hay con qué comparar. Ahora sin
 *    meta no se dibuja ni barra ni porcentaje, y se dice por qué.
 *
 * El fondo azul es deliberadamente el mismo en claro y en oscuro: es una
 * superficie propia, con su texto blanco y su contraste resueltos dentro, así
 * que no depende del tema del teléfono ni del interruptor de la app.
 */
export function MyDayHero({
  firstName,
  appVersion,
  shift,
  performance,
  clima
}: {
  firstName: string;
  appVersion: string;
  shift: Shift;
  performance: Performance;
  /**
   * ⚠️ Opcional a propósito: el clima puede no llegar --proveedor caído, el
   * teléfono sin datos-- y el recuadro tiene que pintarse igual. Cuando llega,
   * se queda aquí en pequeño para que la entrada no sea la ÚNICA forma de
   * verlo.
   */
  clima?: Clima | null;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const hayMeta = performance.goal > 0;

  const salesStatus = useMemo(() => {
    if (!hayMeta) return "Aún no hay meta cargada para hoy";
    const remaining = Math.max(0, performance.goal - performance.sales);
    return remaining === 0
      ? "Meta del día alcanzada"
      : `Te faltan ${money(remaining)} para la meta`;
  }, [hayMeta, performance.goal, performance.sales]);

  // Se recorta al pintar: un 140 % desbordaría la barra por la derecha, y el
  // número de al lado ya dice el valor real.
  const anchoBarra = Math.max(0, Math.min(100, performance.progress));

  return (
    <section
      aria-label="Resumen de mi jornada"
      className="relative isolate overflow-hidden rounded-[26px] bg-[#09152F] px-5 pb-4 pt-5 text-white shadow-[0_18px_40px_rgb(4_12_28_/_0.30)]"
    >
      <span aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(150deg,#081228_0%,#12336E_58%,#2A6BF0_135%)]" />
      <span aria-hidden className="absolute -right-20 -top-24 -z-10 size-60 rounded-full bg-sky-300/20 blur-3xl" />

      {/* Encabezado: quién y qué hora es. Lo de menos peso, arriba y en pequeño. */}
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100/70">
          Hola, {firstName}
        </p>
        <span className="flex shrink-0 items-center gap-2.5 text-xs font-semibold tabular-nums text-blue-50">
          {clima ? <ClimaChip clima={clima} /> : null}
          <span className="flex items-center gap-1.5">
            <Clock3 size={14} className="text-sky-200" />
            <time className={now ? "transition-opacity duration-300" : "opacity-0"}>{localTime(now)}</time>
          </span>
        </span>
      </div>

      {/* El titular: en qué punto de la jornada estás. */}
      <h2 className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-[-0.03em]">
        {shiftMoment(shift, now)}
      </h2>

      {/* La cifra del día, con su meta y su avance en un solo bloque. */}
      <div className="mt-5 rounded-2xl bg-[#040C1C]/40 px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-100/65">Mi venta de hoy</p>
            <p className="mt-1 truncate text-[2rem] font-semibold leading-none tracking-[-0.035em] tabular-nums">
              {money(performance.sales)}
            </p>
          </div>
          {hayMeta ? (
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold leading-none tabular-nums text-sky-200">{performance.progress}%</p>
              <p className="mt-1 text-[11px] font-medium tabular-nums text-blue-100/65">de {money(performance.goal)}</p>
            </div>
          ) : null}
        </div>

        {hayMeta ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/12" role="presentation">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7DD3FC,#38BDF8)] transition-[width] duration-500"
              style={{ width: `${anchoBarra}%` }}
            />
          </div>
        ) : null}

        <p className="mt-2.5 text-xs font-medium text-blue-100/80">{salesStatus}</p>
      </div>

      {/* Pie: los dos conteos del día y, en pequeño, la versión instalada. */}
      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-blue-200/12 pt-3">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <ReceiptText size={14} className="text-sky-200/90" />
            <span className="text-sm font-semibold tabular-nums">{performance.transactions}</span>
            <span className="text-[11px] font-medium text-blue-100/65">tickets</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ShoppingBag size={14} className="text-sky-200/90" />
            <span className="text-sm font-semibold tabular-nums">{performance.pieces}</span>
            <span className="text-[11px] font-medium text-blue-100/65">prendas</span>
          </span>
        </div>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-100/40">
          v{appVersion}
        </span>
      </div>
    </section>
  );
}
