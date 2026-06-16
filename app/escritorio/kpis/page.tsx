"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ExternalLink } from "lucide-react";
import { completion, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { achievementTone, Badge, Card, ProgressBar, ProfileAvatar } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopData } from "@/components/desktop/useDesktopData";

function fmt(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "—" : `${value}${suffix}`;
}

export default function EscritorioKpis() {
  const { data } = useDesktopData();
  const { isDark } = useTheme();

  if (!data) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-3xl bg-slate-200 dark:bg-slate-800" />)}</div>
        <div className="h-96 rounded-3xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  const store = data.dashboardDaily;
  const todayKey = store.date;
  const storeProgress = completion(store.dailySales, store.dailyGoal);
  const storeUpt = store.transactions > 0 ? Math.round((store.pieces / store.transactions) * 100) / 100 : null;
  const advisors = data.users.filter((u) => u.role === "ASESOR");

  const rows = advisors
    .map((a) => {
      const kpi = data.kpis.find((k) => k.userId === a.id && k.date === todayKey);
      const resting = !kpi || (kpi.dailyGoal ?? 0) === 0;
      const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
      return { advisor: a, kpi, resting, progress };
    })
    .sort((a, b) => Number(a.resting) - Number(b.resting) || b.progress - a.progress);

  const chartData = rows
    .filter((r) => !r.resting)
    .map((r) => ({ name: r.advisor.name.split(" ")[0], Venta: r.kpi?.dailySales ?? 0, Meta: r.kpi?.dailyGoal ?? 0 }));
  const tooltipStyle = isDark
    ? { background: "#1a2540", border: "1px solid #2a3a5c", borderRadius: 12, color: "#f0f4ff" }
    : { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A" };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <StoreCard label="Venta del día" value={money(store.dailySales)} />
        <StoreCard label="Meta del día" value={money(store.dailyGoal)} />
        <StoreCard label="Alcance" value={`${storeProgress}%`} tone={storeProgress} />
        <StoreCard label="Conversión" value={fmt(store.conversion, "%")} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <StoreCard label="Tickets" value={String(store.transactions)} />
        <StoreCard label="Piezas" value={String(store.pieces)} />
        <StoreCard label="UPT" value={fmt(storeUpt)} />
        <StoreCard label="Tráfico" value={fmt(store.traffic)} />
      </div>

      {chartData.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-black text-ink">Venta vs meta por asesor — hoy</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => money(v)} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(37,99,235,0.05)" }} formatter={(value) => money(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Bar dataKey="Meta" fill="#94A3B8" radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Bar dataKey="Venta" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><BarChart3 className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Desempeño por asesor — hoy</h2></div>
          <Link href="/kpis" className="flex items-center gap-1.5 text-xs font-bold text-volt hover:underline">Análisis por período <ExternalLink size={13} /></Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
              <tr>
                <th className="px-4 py-2.5">Asesor</th>
                <th className="px-4 py-2.5 text-right">Venta</th>
                <th className="px-4 py-2.5 text-right">Meta</th>
                <th className="px-4 py-2.5 w-36">Alcance</th>
                <th className="px-4 py-2.5 text-right">Tickets</th>
                <th className="px-4 py-2.5 text-right">UPT</th>
                <th className="px-4 py-2.5 text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.advisor.id} className="border-t border-line transition-colors hover:bg-volt/[0.04] even:bg-slate-50/50 dark:even:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ProfileAvatar name={r.advisor.name} photoUrl={r.advisor.photoUrl} size="sm" className="size-8 rounded-xl shadow-none" />
                      <span className="font-bold text-ink">{r.advisor.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-ink">{money(r.kpi?.dailySales ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right text-muted">{money(r.kpi?.dailyGoal ?? 0)}</td>
                  <td className="px-4 py-2.5">
                    {r.resting ? <Badge>Descanso</Badge> : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><ProgressBar value={r.progress} tone={achievementTone(r.progress)} /></div>
                        <span className="w-9 shrink-0 text-right text-xs font-black text-ink">{r.progress}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink">{r.resting ? "—" : (r.kpi?.transactions ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right text-ink">{r.resting ? "—" : fmt(r.kpi?.upt)}</td>
                  <td className="px-4 py-2.5 text-right text-ink">{r.resting ? "—" : fmt(r.kpi?.conversion, "%")}</td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">Sin asesores con datos hoy.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StoreCard({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneText = tone === undefined ? "text-ink" : tone >= 100 ? "text-success" : tone >= 90 ? "text-ember" : "text-orchid";
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={cn("mt-2 text-[1.55rem] font-black leading-none tracking-[-0.03em]", toneText)}>{value}</p>
    </Card>
  );
}
