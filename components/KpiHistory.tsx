"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ChartTooltip, lineCursor } from "@/components/ChartTooltip";
import { History, TrendingDown, TrendingUp } from "lucide-react";
import { money } from "@/lib/format";
import { percentDelta, type WeekHistoryPoint } from "@/lib/kpi-history";
import { Badge, Card, Skeleton } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

// Vista "Histórico": comparativa semana vs semana de los KPIs ya sincronizados.
// Gerencia ve tienda completa; asesor solo sus números (el API ya filtra).

type MetricId = "venta" | "alcance" | "upt" | "aur" | "conversion";
const METRICS: Array<{ id: MetricId; label: string; get: (week: WeekHistoryPoint) => number | null; fmt: (value: number) => string; color: string }> = [
  { id: "venta", label: "Venta", get: (week) => week.sales, fmt: (value) => money(value), color: "#2563EB" },
  { id: "alcance", label: "Alcance", get: (week) => week.achievement, fmt: (value) => `${Math.round(value)}%`, color: "#22C55E" },
  { id: "upt", label: "UPT", get: (week) => week.upt, fmt: (value) => value.toFixed(2), color: "#8B5CF6" },
  { id: "aur", label: "AUR", get: (week) => week.aur, fmt: (value) => money(value), color: "#F59E0B" },
  { id: "conversion", label: "Conversión", get: (week) => week.conversion, fmt: (value) => `${value.toFixed(1)}%`, color: "#EC4899" }
];

export function KpiHistoryView() {
  const { isDark } = useTheme();
  const [weeks, setWeeks] = useState<WeekHistoryPoint[] | null>(null);
  const [error, setError] = useState(false);
  const [metricId, setMetricId] = useState<MetricId>("venta");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kpis/history?weeks=12", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((payload: { weeks: WeekHistoryPoint[] }) => setWeeks(payload.weeks))
      .catch((cause) => { if (!(cause instanceof DOMException)) setError(true); });
    return () => controller.abort();
  }, []);

  const metric = METRICS.find((item) => item.id === metricId) ?? METRICS[0];
  const chartData = useMemo(
    () => (weeks ?? []).map((week) => ({ name: `S${week.weekNumber}`, valor: metric.get(week) ?? 0 })),
    [weeks, metric]
  );
  const latest = weeks?.at(-1) ?? null;
  const previous = weeks && weeks.length > 1 ? weeks[weeks.length - 2] : null;

  if (error) return <Card className="p-4"><p className="text-sm font-semibold text-muted">No se pudo cargar el histórico.</p></Card>;
  if (!weeks) return <div className="space-y-3"><Skeleton className="h-52" /><Skeleton className="h-24" /></div>;
  if (weeks.length === 0) return <Card className="p-4"><p className="text-sm font-semibold text-muted">Aún no hay semanas sincronizadas para comparar.</p></Card>;


  return (
    <>
      <Card className="mb-3 p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2"><History className="text-volt" size={18} /><h2 className="text-lg font-semibold text-ink">Histórico semanal</h2></div>
          <Badge>{weeks.length} semanas</Badge>
        </div>
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {METRICS.map((option) => (
            <button key={option.id} type="button" onClick={() => setMetricId(option.id)} className={cn("min-h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold transition active:scale-95", metricId === option.id ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}>{option.label}</button>
          ))}
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="kpiHistory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metric.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={metric.color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fill: isDark ? "#8899BB" : "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.07)"} vertical={false} />
              <Tooltip
                content={<ChartTooltip isDark={isDark} format={(v) => metric.fmt(v)} />}
                cursor={lineCursor(isDark)}
                allowEscapeViewBox={{ x: false, y: true }}
                offset={12}
              />
              <Area type="monotone" dataKey="valor" stroke={metric.color} strokeWidth={2.5} fill="url(#kpiHistory)" dot={{ r: 3.5, fill: metric.color, stroke: isDark ? "#1a2540" : "#FFFFFF", strokeWidth: 1.5 }} animationDuration={700} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {latest && previous ? (
        <Card className="mb-3 p-3.5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Semana {latest.weekNumber} vs semana {previous.weekNumber}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DeltaChip label="Venta" delta={percentDelta(latest.sales, previous.sales)} />
            <DeltaChip label="UPT" delta={percentDelta(latest.upt, previous.upt)} />
            <DeltaChip label="AUR" delta={percentDelta(latest.aur, previous.aur)} />
            <DeltaChip label="Conversión" delta={percentDelta(latest.conversion, previous.conversion)} />
          </div>
        </Card>
      ) : null}

      <Card className="divide-y divide-line p-3.5">
        {[...weeks].reverse().map((week, index, list) => {
          const prior = list[index + 1] ?? null;
          const delta = prior ? percentDelta(week.sales, prior.sales) : null;
          return (
            <div key={week.weekStart} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-semibold text-ink">Semana {week.weekNumber}</p>
                <p className="text-xs font-semibold text-muted">{formatRange(week.weekStart, week.weekEnd)}</p>
              </div>
              <div className="flex items-center gap-2.5">
                {delta !== null ? (
                  <span className={cn("flex items-center gap-0.5 text-xs font-semibold", delta >= 0 ? "text-success" : "text-orchid")}>
                    {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(delta).toFixed(1)}%
                  </span>
                ) : null}
                <p className="font-semibold text-ink">{money(week.sales)}</p>
                <Badge tone={week.achievement >= 100 ? "success" : week.achievement >= 90 ? "warn" : "danger"}>{Math.round(week.achievement)}%</Badge>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}

function DeltaChip({ label, delta }: { label: string; delta: number | null }) {
  const positive = delta !== null && delta >= 0;
  return (
    <div className="rounded-xl bg-panel px-2.5 py-2 ring-1 ring-line">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
      {delta === null ? (
        <p className="mt-0.5 text-sm font-semibold text-muted">—</p>
      ) : (
        <p className={cn("mt-0.5 flex items-center gap-1 text-sm font-semibold", positive ? "text-success" : "text-orchid")}>
          {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{positive ? "+" : "−"}{Math.abs(delta).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

function formatRange(startIso: string, endIso: string) {
  const format = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${format(startIso)} – ${format(endIso)}`;
}
