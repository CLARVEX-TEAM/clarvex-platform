"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AlertTriangle, ArrowRight, Megaphone, Receipt, ShoppingBag, Target, TrendingUp, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { completion, money } from "@/lib/format";
import { buildSalesTrend } from "@/lib/trend";
import { cn } from "@/lib/utils";
import { achievementTone, Badge, Card, ProgressBar, ProgressRing, ProfileAvatar, priorityTone } from "@/components/ui";
import { TeamCelebrationsCard } from "@/components/home/TeamCelebrationsCard";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import { ExecutiveDashboard } from "@/components/home/ExecutiveDashboard";

// Días hasta el próximo cumpleaños (para ordenar por más cercano).
function daysUntilBirthday(birthDate?: string | null): number {
  if (!birthDate) return 9999;
  const d = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let next = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

export default function EscritorioDashboard() {
  const { data, error, reload } = useDesktopData();
  const { isDark } = useTheme();

  if (error && !data) return <DesktopError onRetry={reload} />;
  if (!data) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-3xl bg-slate-200 dark:bg-slate-800" />)}</div>
        <div className="grid grid-cols-3 gap-4"><div className="col-span-2 h-72 rounded-3xl bg-slate-200 dark:bg-slate-800" /><div className="h-72 rounded-3xl bg-slate-200 dark:bg-slate-800" /></div>
      </div>
    );
  }

  const store = data.dashboardDaily;
  const advisors = data.users.filter((u) => u.role === "ASESOR");
  const storeProgress = completion(store?.dailySales ?? 0, store?.dailyGoal ?? 0);
  const todayKey = store.date;
  const critical = data.pendings
    .filter((p) => (p.priority === "critica" || p.priority === "alta") && p.status !== "completado")
    .slice(0, 6);
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Equipo";

  const ranking = advisors
    .map((a) => {
      const kpi = data.kpis.find((k) => k.userId === a.id && k.date === todayKey);
      const resting = !kpi || (kpi.dailyGoal ?? 0) === 0;
      const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
      return { advisor: a, sales: kpi?.dailySales ?? 0, goal: kpi?.dailyGoal ?? 0, progress, resting };
    })
    .sort((a, b) => Number(a.resting) - Number(b.resting) || b.progress - a.progress || b.sales - a.sales);

  const celebrationMembers = [...data.users]
    .filter((u) => u.birthDate || u.hireDate)
    .sort((a, b) => daysUntilBirthday(a.birthDate) - daysUntilBirthday(b.birthDate))
    .slice(0, 6)
    .map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl, birthDate: u.birthDate, hireDate: u.hireDate }));

  const trend = buildSalesTrend(
    data.kpis.map((k) => ({ date: k.date, dailySales: k.dailySales, dailyGoal: k.dailyGoal })),
    todayKey
  );
  const tooltipStyle = isDark
    ? { background: "#1a2540", border: "1px solid #2a3a5c", borderRadius: 12, color: "#f0f4ff" }
    : { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A" };

  return (
    <div className="space-y-5">
      {/* KPIs de tienda */}
      <div className="grid grid-cols-4 gap-4">
        <KpiTile icon={ShoppingBag} label="Venta hoy" value={money(store?.dailySales ?? 0)} tone="text-volt" />
        <KpiTile icon={Target} label="Meta hoy" value={money(store?.dailyGoal ?? 0)} tone="text-sky-500" />
        <KpiTile icon={TrendingUp} label="Conversión" value={store?.conversion == null ? "—" : `${store.conversion}%`} tone="text-purple-500" />
        <KpiTile icon={Receipt} label="Tickets" value={String(store?.transactions ?? 0)} tone="text-emerald-500" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Análisis Operativo IA */}
        <div className="col-span-2">
          <ExecutiveDashboard />
        </div>

        {/* Alcance del día + accesos */}
        <Card className="flex flex-col items-center justify-center p-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Alcance del día</p>
          <div className="my-3"><ProgressRing value={storeProgress} tone={achievementTone(storeProgress)} size={120} /></div>
          <p className="text-sm text-muted">{money(store?.dailySales ?? 0)} de {money(store?.dailyGoal ?? 0)}</p>
          <div className="mt-4 grid w-full gap-2">
            <QuickAction href="/escritorio/comunicados" icon={Megaphone} label="Nuevo comunicado" />
            <QuickAction href="/escritorio/pendientes" icon={AlertTriangle} label="Nuevo pendiente" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Tendencia de ventas */}
        <Card className="col-span-2 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-ink">Tendencia de ventas</h2>
            <Badge>Últimos {trend.length} días</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="deskSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="deskGoal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#94A3B8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [money(Number(value)), name === "sales" ? "Venta" : "Meta"]} labelFormatter={(l) => `Día ${l}`} />
                <Area type="monotone" dataKey="goal" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" fill="url(#deskGoal)" dot={false} />
                <Area type="monotone" dataKey="sales" stroke="#2563EB" strokeWidth={2.5} fill="url(#deskSales)" dot={false} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Ranking del equipo */}
        <Card className="col-span-2 p-5">
          <div className="mb-3 flex items-center gap-2">
            <UsersRound className="text-volt" size={18} />
            <h2 className="text-lg font-black text-ink">Equipo hoy</h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                <tr>
                  <th className="px-4 py-2.5">Asesor</th>
                  <th className="px-4 py-2.5 text-right">Venta</th>
                  <th className="px-4 py-2.5 text-right">Meta</th>
                  <th className="px-4 py-2.5 w-40">Alcance</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.advisor.id} className="border-t border-line transition-colors hover:bg-volt/[0.04] even:bg-slate-50/50 dark:even:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ProfileAvatar name={r.advisor.name} photoUrl={r.advisor.photoUrl} size="sm" className="size-8 rounded-xl shadow-none" />
                        <span className="font-bold text-ink">{i === 0 && !r.resting ? "👑 " : ""}{r.advisor.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-ink">{money(r.sales)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{money(r.goal)}</td>
                    <td className="px-4 py-2.5">
                      {r.resting ? <Badge>Descanso</Badge> : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1"><ProgressBar value={r.progress} tone={achievementTone(r.progress)} /></div>
                          <span className="w-9 shrink-0 text-right text-xs font-black text-ink">{r.progress}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {ranking.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Sin asesores con datos hoy.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Críticos + celebraciones */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><AlertTriangle className="text-orchid" size={18} /><h2 className="text-lg font-black text-ink">Críticos</h2></div>
              <Link href="/escritorio/pendientes" className="text-xs font-bold text-volt hover:underline">Ver todos</Link>
            </div>
            <div className="space-y-2.5">
              {critical.map((p) => (
                <div key={p.id} className="rounded-2xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{p.title}</p>
                    <Badge tone={priorityTone(p.priority)}>{p.priority}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{userName(p.ownerId)} · vence {p.dueDate}</p>
                </div>
              ))}
              {critical.length === 0 ? <p className="py-6 text-center text-sm text-muted">Sin pendientes críticos. 🎉</p> : null}
            </div>
          </Card>

          {celebrationMembers.length > 0 ? (
            <TeamCelebrationsCard members={celebrationMembers} manageHref="/escritorio/equipo" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
        <span className={cn("grid size-9 place-items-center rounded-2xl bg-blue-50 dark:bg-[#1a2540]", tone)}><Icon size={17} /></span>
      </div>
      <p className={cn("mt-3 text-[1.7rem] font-black leading-none tracking-[-0.03em]", tone)}>{value}</p>
    </Card>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="tappable group flex min-h-11 items-center justify-between rounded-2xl border border-line bg-panel px-3.5 text-sm font-bold text-ink transition hover:border-volt/40 hover:text-volt">
      <span className="flex items-center gap-2.5"><Icon size={17} className="text-volt" /> {label}</span>
      <motion.span className="text-muted transition group-hover:text-volt" whileHover={{ x: 3 }}><ArrowRight size={16} /></motion.span>
    </Link>
  );
}
