"use client";

import { useEffect, useState } from "react";
import { Gauge, TrendingDown, TrendingUp } from "lucide-react";
import { computePace, type Pace } from "@/lib/pace";
import { money } from "@/lib/format";
import { dateKey, startOfWeek } from "@/lib/schedule-week";
import { Card, ProgressBar } from "@/components/ui";

type ScheduleItem = { userId: string; date: string; status: string; startTime: string | null; endTime: string | null };

export function PaceCard({ sales, goal, userId }: { sales: number; goal: number; userId: string }) {
  const [shift, setShift] = useState<{ start: string | null; end: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const weekStart = dateKey(startOfWeek(new Date()));
    const now = new Date();
    const todayKey = dateKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
    fetch(`/api/schedules?weekStart=${weekStart}&userId=${userId}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ schedules?: ScheduleItem[] }>)
      .then((payload) => {
        const today = (payload.schedules ?? []).find((s) => s.date === todayKey && s.status === "WORKING");
        setShift(today ? { start: today.startTime, end: today.endTime } : null);
      })
      .catch(() => setShift(null))
      .finally(() => setLoaded(true));
  }, [userId]);

  if (!loaded) return null;

  const pace: Pace | null = shift ? computePace({ sales, goal, shiftStart: shift.start, shiftEnd: shift.end }) : null;
  if (!pace) return null; // sin turno con horas o sin meta: no mostramos pace

  if (pace.beforeShift) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-volt dark:bg-[#1a2540]"><Gauge size={22} /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Ritmo del día</p>
            <p className="mt-0.5 text-sm font-bold text-ink">Tu turno aún no empieza. ¡Prepárate! 💪</p>
          </div>
        </div>
      </Card>
    );
  }

  const tone = pace.onTrack ? "text-success" : "text-ember";
  const title = pace.afterShift ? "Cierre del turno" : "Ritmo del día";

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">{title}</p>
          <h2 className="mt-1 text-[1.9rem] font-semibold leading-none text-ink">{money(pace.projected)}</h2>
          <p className={`mt-1 text-xs font-semibold ${tone}`}>
            {pace.afterShift
              ? `Cerraste al ${pace.projectedAchievement}% de tu meta`
              : pace.onTrack
                ? `Vas al ritmo · proyectas ${pace.projectedAchievement}% de tu meta`
                : `Acelera · proyectas ${pace.projectedAchievement}% de tu meta`}
          </p>
        </div>
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${pace.onTrack ? "bg-emerald-50 text-emerald-600 dark:bg-[#10301f]" : "bg-amber-50 text-amber-600 dark:bg-[#2a2410]"}`}>
          {pace.onTrack ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar value={Math.min(pace.projectedAchievement, 100)} tone={pace.onTrack ? "mint" : "ember"} />
        <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-muted">
          <span>Turno {pace.elapsedPct}% transcurrido</span>
          <span>Llevas {money(sales)} · esperado {money(Math.round(pace.expectedSoFar))}</span>
        </div>
      </div>
    </Card>
  );
}
