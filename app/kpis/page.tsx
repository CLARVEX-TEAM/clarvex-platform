"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3, Calculator, CalendarDays, Percent, Receipt, ShoppingBag, Target, TrendingUp, Trophy, UsersRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { findCommissionRule } from "@/lib/commission";
import { completion, money } from "@/lib/format";
import { periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing, StatCard } from "@/components/ui";

type Tab = "resumen" | "ventas" | "comision" | "ranking";
type KpiResponse = {
  period: KpiPeriod;
  selectedDate: string;
  startDate: string;
  endDate: string;
  weekNumber: number | null;
  availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>;
  availableRetailMonths: Array<{ label: string; start: string; end: string }>;
  retailMonthLabel: string | null;
  workedDays: number | null;
  currentUserId: string;
  role: Role;
  store: KpiReportItem | null;
  own: KpiReportItem | null;
  team: KpiReportItem[];
  commissionRules: CommissionRule[];
};

const tabs: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "ventas", label: "Ventas" },
  { id: "comision", label: "Comision" },
  { id: "ranking", label: "Ranking" }
];

export default function KpisPage() {
  const [session, setSession] = useState<User | null>(null);
  const [report, setReport] = useState<KpiResponse | null>(null);
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [simulatedSales, setSimulatedSales] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { getSession().then(setSession); }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSimulatedSales("");
    fetch(`/api/kpis?period=${period}&date=${selectedDate}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as KpiResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los KPIs.");
        setReport(payload);
        if (period === "week" && payload.startDate !== selectedDate) setSelectedDate(payload.startDate);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar los KPIs.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period, selectedDate, session]);

  const isAdvisor = session?.role === "ASESOR";
  const activeKpi = isAdvisor ? (report?.own ?? null) : (report?.store ?? null);
  const periodLabel = period === "week" ? "semanal" : "mensual";
  const progress = completion(activeKpi?.sales ?? 0, activeKpi?.goal ?? 0);
  const commissionKpi = isAdvisor ? (report?.own ?? null) : (report?.store ?? null);
  const initialSimulation = simulatedSales ? Number(simulatedSales) : commissionKpi?.sales ?? 0;
  const commissionBase = commissionKpi?.commissionMinimum ?? commissionKpi?.goal ?? 0;
  const simulatedAchievement = getAchievement(initialSimulation, commissionBase);
  const commissionRole = isAdvisor ? "ASESOR" : session?.role ?? "GERENTE";
  const activeRule = findCommissionRule(report?.commissionRules ?? [], commissionRole, simulatedAchievement);
  const appliedPercent = activeRule?.commissionPercent ?? 0;
  const simulatedCommission = initialSimulation * (appliedPercent / 100);
  const chartData = report?.team.map((item) => ({ name: item.userName, venta: item.sales, meta: item.goal })) ?? [];

  const rangeLabel = report ? formatPeriodLabel(report.period, report.startDate, report.endDate, report.weekNumber, report.retailMonthLabel) : "Cargando periodo";

  return (
    <>
      <AppHeader title="KPIs" subtitle={isAdvisor ? "Tus indicadores por periodo." : "Venta, metas y ranking del equipo."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
        <PeriodSelector period={period} setPeriod={setPeriod} selectedDate={selectedDate} setSelectedDate={setSelectedDate} rangeLabel={rangeLabel} availableWeeks={report?.availableWeeks ?? []} availableRetailMonths={report?.availableRetailMonths ?? []} />

        {isAdvisor && report ? <Card className="mb-3 p-3"><p className="text-sm font-black text-ink">{report.workedDays ? "Calculado sobre tus dias laborados" : "Sin dias laborados en este periodo"}</p><p className="mt-1 text-xs font-semibold text-muted">Dias laborados: {report.workedDays ?? 0}</p></Card> : null}

        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1">
          {tabs.map((tab) => (
            <motion.button key={tab.id} onClick={() => setActiveTab(tab.id)} whileTap={{ scale: 0.96 }} className={`relative min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black transition ${activeTab === tab.id ? "text-white" : "text-muted hover:text-ink"}`}>
              {activeTab === tab.id ? <motion.span layoutId="kpi-tab-active" className="absolute inset-0 rounded-full bg-volt shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} /> : null}
              <span className="relative">{tab.label}</span>
            </motion.button>
          ))}
        </div>

        {error ? <Card className="mb-3 bg-rose-50 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {loading ? <Card className="text-sm font-semibold text-muted">Calculando acumulados...</Card> : activeKpi ? (
          <AnimatePresence mode="wait">
            <motion.div key={`${activeTab}-${period}-${selectedDate}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {activeTab === "resumen" ? <ResumenView activeKpi={activeKpi} progress={progress} periodLabel={periodLabel} /> : null}
              {activeTab === "ventas" ? <VentasView activeKpi={activeKpi} chartData={chartData} progress={progress} periodLabel={periodLabel} /> : null}
              {activeTab === "comision" ? <ComisionView activeKpi={commissionKpi ?? activeKpi} rules={report?.commissionRules ?? []} simulatedSales={simulatedSales} setSimulatedSales={setSimulatedSales} activeRule={activeRule} appliedPercent={appliedPercent} simulatedCommission={simulatedCommission} simulatedAchievement={simulatedAchievement} commissionRole={commissionRole} periodLabel={periodLabel} /> : null}
              {activeTab === "ranking" ? <RankingView ranking={report?.team ?? []} periodLabel={periodLabel} isAdvisor={isAdvisor} currentUserId={report?.currentUserId} /> : null}
            </motion.div>
          </AnimatePresence>
        ) : <Card className="text-sm font-semibold text-muted">No hay KPIs dentro de {rangeLabel}.</Card>}
      </AppFrame>
      <BottomNav />
    </>
  );
}

function PeriodSelector({ period, setPeriod, selectedDate, setSelectedDate, rangeLabel, availableWeeks, availableRetailMonths }: { period: KpiPeriod; setPeriod: (period: KpiPeriod) => void; selectedDate: string; setSelectedDate: (date: string) => void; rangeLabel: string; availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>; availableRetailMonths: Array<{ label: string; start: string; end: string }> }) {
  return (
    <Card className="mb-3 p-3">
      <div className="flex rounded-full bg-slate-100 p-1" role="group" aria-label="Periodo de KPIs">
        {(["week", "month"] as const).map((option) => <button key={option} type="button" onClick={() => setPeriod(option)} className={`min-h-10 flex-1 rounded-full text-sm font-black transition ${period === option ? "bg-white text-volt shadow-sm" : "text-muted"}`}>{option === "week" ? "Semana" : "Mes"}</button>)}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-volt"><CalendarDays size={18} /></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-muted">Periodo seleccionado</p><p className="truncate text-sm font-black text-ink">{rangeLabel}</p></div>
        {period === "week" ? <select aria-label="Seleccionar semana RDV" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 w-[8.3rem] rounded-xl bg-slate-100 px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20">{availableWeeks.map((week) => <option key={`${week.weekNumber}-${week.weekStart}`} value={week.weekStart}>Semana {week.weekNumber}</option>)}</select> : <select aria-label="Seleccionar mes retail" value={availableRetailMonths.find((month) => selectedDate >= month.start && selectedDate <= month.end)?.start ?? availableRetailMonths.at(-1)?.start ?? selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 w-[8.3rem] rounded-xl bg-slate-100 px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20">{availableRetailMonths.map((month) => <option key={month.start} value={month.start}>{month.label}</option>)}</select>}
      </div>
    </Card>
  );
}

function ResumenView({ activeKpi, progress, periodLabel }: { activeKpi: KpiReportItem; progress: number; periodLabel: string }) {
  return <><Card className="premium-hero mb-3 px-4 py-3.5"><div className="flex items-center justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Cumplimiento {periodLabel}</p><h2 className="mt-1 text-[2.25rem] font-black leading-none text-ink">{progress}%</h2><p className="mt-1 text-xs text-muted">{money(activeKpi.sales)} de {money(activeKpi.goal)}</p></div><ProgressRing value={progress} size={68} /></div><ProgressBar value={progress} /></Card><div className="grid grid-cols-2 gap-3"><StatCard compact label="UPT" value={activeKpi.upt === null ? "—" : String(activeKpi.upt)} detail="Unidades por ticket" icon={<ShoppingBag size={15} />} /><StatCard compact label="AUR" value={activeKpi.aur === null ? "—" : money(activeKpi.aur)} detail="Precio promedio pieza" tone="sky" icon={<Receipt size={15} />} /><StatCard compact label="EPT" value={activeKpi.ept === null ? "—" : money(activeKpi.ept)} detail="Venta por transaccion" tone="purple" icon={<BarChart3 size={15} />} /><StatCard compact label="Conversion" value={activeKpi.conversion === null ? "Sin trafico" : `${activeKpi.conversion}%`} detail={activeKpi.conversion === null ? "Trafico no disponible" : "Tickets / Trafico"} tone="ember" icon={<Target size={15} />} /><StatCard compact label="Margen DTO" value={activeKpi.discountMargin === null ? "Sin datos POS" : `${activeKpi.discountMargin}%`} detail={activeKpi.discountMargin === null ? "Vincula Descuentos POS" : "Descuento sobre venta bruta"} tone="orchid" icon={<Percent size={15} />} /><StatCard compact label="Meta" value={money(activeKpi.goal)} detail={`Objetivo ${periodLabel}`} tone="volt" icon={<Target size={15} />} /></div></>;
}

function VentasView({ activeKpi, chartData, progress, periodLabel }: { activeKpi: KpiReportItem; chartData: Array<{ name: string; venta: number; meta: number }>; progress: number; periodLabel: string }) {
  const data = chartData.length ? chartData : [{ name: activeKpi.userName, venta: activeKpi.sales, meta: activeKpi.goal }];
  return <><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp className="text-volt" size={18} /><h2 className="text-lg font-black">Ventas {periodLabel}s</h2></div><Badge>{progress}%</Badge></div><div className="h-36"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><defs><linearGradient id="kpiSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.34} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} /></linearGradient></defs><Tooltip contentStyle={tooltipStyle} /><Area type="monotone" dataKey="venta" stroke="#2563EB" strokeWidth={3} fill="url(#kpiSales)" animationDuration={800} animationEasing="ease-out" animationBegin={0} /></AreaChart></ResponsiveContainer></div></Card><div className="grid grid-cols-2 gap-3"><StatCard compact label={`Venta ${periodLabel}`} value={money(activeKpi.sales)} detail="Acumulada" progress={progress} icon={<ShoppingBag size={15} />} /><StatCard compact label={`Meta ${periodLabel}`} value={money(activeKpi.goal)} detail="Suma de metas diarias" tone="sky" icon={<Target size={15} />} /><StatCard compact label="Cumplimiento" value={`${progress}%`} detail={`Periodo ${periodLabel}`} tone="purple" progress={progress} icon={<TrendingUp size={15} />} /><StatCard compact label="Transacciones" value={String(activeKpi.transactions)} detail="Tickets acumulados" tone="ember" icon={<Receipt size={15} />} /></div></>;
}

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string }) {
  const missingRuleMessage = `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  return <><Card className="premium-hero mb-3 p-3.5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Comision estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-black leading-none text-ink">{money(simulatedCommission)}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-rose-700"}`}>{activeRule ? `${activeRule.commissionPercent}% por nivel actual` : missingRuleMessage}</p></div><span className="grid size-12 place-items-center rounded-2xl bg-violet-50 text-purple"><Trophy size={25} /></span></div><div className="mt-2.5 grid grid-cols-2 gap-2"><Mini label="Porcentaje" value={`${appliedPercent}%`} /><Mini label="Cumplimiento" value={`${Math.round(simulatedAchievement)}%`} /></div></Card><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center gap-2"><Calculator className="text-volt" size={18} /><h2 className="text-lg font-black">Simulador {periodLabel}</h2></div><input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(activeKpi.sales)} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-2xl border border-line bg-blue-50 px-4 text-xl font-black text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15" /></Card><Card className="p-3.5"><div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-black">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>{rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => <div key={rule.id} className="flex items-center justify-between border-t border-line py-2.5 first:border-0"><div><p className="font-black">{rule.minAchievement}% a {rule.maxAchievement ?? "mas"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div><Badge tone={rule.id === activeRule?.id ? "success" : "default"}>{rule.commissionPercent}%</Badge></div>)}</Card></>;
}

function RankingView({ ranking, periodLabel, isAdvisor, currentUserId }: { ranking: KpiReportItem[]; periodLabel: string; isAdvisor?: boolean; currentUserId?: string }) {
  const data = ranking.map((item) => ({ name: item.userName, venta: isAdvisor ? item.achievement : item.sales }));
  return <><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-black">Ranking {periodLabel}</h2></div><Badge>equipo</Badge></div><div className="h-28"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => isAdvisor ? [`${value}%`, "Cumplimiento"] : [money(Number(value)), "Venta"]} /><Bar dataKey="venta" fill="#2563EB" radius={[8, 8, 8, 8]} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></BarChart></ResponsiveContainer></div></Card><Card className="divide-y divide-line p-3.5">{ranking.length ? ranking.map((item) => <div key={item.userId} className="py-3 first:pt-0 last:pb-0"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="md" /><div><h3 className="font-black">{item.userName}</h3><p className="text-sm text-muted">#{item.ranking}{!isAdvisor || item.userId === currentUserId ? ` · ${money(item.sales)}` : ""}</p></div></div><Badge>{Math.round(item.achievement)}%</Badge></div><ProgressBar value={item.achievement} /></div>) : <p className="text-sm font-semibold text-muted">No hay asesores con datos en este periodo.</p>}</Card></>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="px-2"><p className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{label}</p><p className="mt-1 font-black text-ink">{value}</p></div>; }

function getAchievement(sales: number, goal: number) { return goal > 0 ? (sales / goal) * 100 : 0; }
function localDateKey(date: Date) { return periodDateKey(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))); }
function formatPeriodLabel(period: KpiPeriod, startValue: string, endValue: string, weekNumber: number | null, retailMonthLabel: string | null) { const start = new Date(`${startValue}T00:00:00Z`); const end = new Date(`${endValue}T00:00:00Z`); const startLabel = start.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); if (period === "month") return `${retailMonthLabel ?? "Mes retail"} · ${startLabel} - ${endLabel}`; return `Semana ${weekNumber ?? "RDV"} · ${startLabel} - ${endLabel}`; }
const tooltipStyle = { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A", boxShadow: "0 6px 14px rgb(15 23 42 / 0.08)" };
