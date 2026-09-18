"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, ReceiptText, ShoppingBag, Timer } from "lucide-react";
import { ProgressBar } from "@/components/ui";
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

export function MyDayHero({
  firstName,
  appVersion,
  shift,
  performance
}: {
  firstName: string;
  appVersion: string;
  shift: Shift;
  performance: Performance;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const salesStatus = useMemo(() => {
    if (performance.goal <= 0) return "Meta pendiente de cargar";
    const remaining = Math.max(0, performance.goal - performance.sales);
    return remaining === 0 ? "Meta del día alcanzada" : `Te faltan ${money(remaining)} para la meta`;
  }, [performance.goal, performance.sales]);

  return (
    <section aria-label="Resumen de mi jornada" className="relative isolate overflow-hidden rounded-2xl bg-[#09152F] px-5 py-5 text-white shadow-[0_16px_38px_rgb(4_12_28_/_0.28)] dark:bg-[#09152F]">
      <span aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(135deg,#071126_0%,#102D62_55%,#2563EB_130%)]" />
      <span aria-hidden className="absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-sky-300/25 blur-3xl" />
      <span aria-hidden className="absolute -bottom-24 -left-16 -z-10 size-52 rounded-full bg-indigo-500/25 blur-3xl" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-[linear-gradient(180deg,transparent,rgb(3_10_24_/_0.42))]" />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold tracking-[-0.035em]">Hola, {firstName}</h2>
          <p className="mt-1 truncate text-sm text-blue-100/80">{shift?.summary ?? "Horario pendiente de cargar"}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-sm font-semibold tabular-nums">
            <Clock3 size={15} className="text-sky-200" />
            <time>{localTime(now)}</time>
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-100/70">Hora local · v{appVersion}</p>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-100/75">Mi venta de hoy</p>
          <p className="mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{money(performance.sales)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums">{performance.progress}%</p>
          <p className="mt-0.5 text-xs font-medium text-blue-100/75">de {money(performance.goal)}</p>
        </div>
      </div>
      <ProgressBar value={performance.progress} tone="sky" className="mt-3 bg-white/15" />
      <p className="mt-2 text-xs font-medium text-blue-100/80">{salesStatus}</p>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-blue-200/15 pt-4">
        <div className="flex items-center gap-2.5">
          <ReceiptText size={16} className="text-sky-200" />
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-100/70">Tickets</p><p className="text-sm font-semibold tabular-nums">{performance.transactions}</p></div>
        </div>
        <div className="flex items-center gap-2.5">
          <ShoppingBag size={16} className="text-sky-200" />
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-100/70">Prendas</p><p className="text-sm font-semibold tabular-nums">{performance.pieces}</p></div>
        </div>
        <div className="col-span-2 flex items-center gap-2 rounded-xl bg-blue-950/35 px-3 py-2.5 text-xs font-semibold text-blue-50">
          <Timer size={16} className="shrink-0 text-sky-200" />
          <span>{shiftMoment(shift, now)}</span>
        </div>
      </div>
    </section>
  );
}
