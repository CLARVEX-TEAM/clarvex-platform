"use client";

import { useCallback, useMemo, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calculator, CalendarDays, Download, Receipt, Settings2, ShoppingBag, Target, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import type { KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { KPI_TABS as tabs, METRIC_CONFIG, formatWeeksElapsed, localDateKey, type KpiTab as Tab, type KpiTarget, type MonthProjection, type MonthSalesProjection, type ReceiptLine, type ReceiptMonth } from "@/lib/kpi-view";
import { useKpiDerived, useKpiReceipts, useKpiReport, useKpiTargets } from "@/lib/use-kpis";
import { achievementTone, Badge, Card, ProfileAvatar, ProgressBar, ProgressRing, Skeleton, StatCard } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopChrome } from "@/components/desktop/DesktopChrome";
import { cn } from "@/lib/utils";

export default function EscritorioKpis() {
  const { setLastUpdated } = useDesktopChrome();
  const [session, setSession] = useState<User | null>(null);
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [simulatedSales, setSimulatedSales] = useState("");
  const [showTargetSheet, setShowTargetSheet] = useState(false);

  useEffect(() => { getSession().then(setSession); }, []);

  // Al recargar el reporte se limpia la simulación de comisión.
  useEffect(() => { setSimulatedSales(""); }, [period, selectedDate]);

  const onLoaded = useCallback(() => setLastUpdated(new Date()), [setLastUpdated]);
  const { report, loading, error } = useKpiReport({ session, period, selectedDate, setSelectedDate, onLoaded });
  const { targets, setTargets } = useKpiTargets(session);
  const { receipts, receiptsLoading } = useKpiReceipts({ activeTab, session, report, period, selectedDate });
  const {
    isAdvisor, isManager, activeKpi, periodLabel, progress, commissionKpi,
    hasCommissionMinimum, simulatedAchievement, commissionRole, activeRule,
    appliedPercent, simulatedCommission, chartData, rangeLabel, periodKey,
    periodTargets, monthProjection, monthSalesProjection
  } = useKpiDerived({ session, report, period, targets, simulatedSales });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodBar
          period={period}
          setPeriod={setPeriod}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          rangeLabel={rangeLabel}
          availableWeeks={report?.availableWeeks ?? []}
          availableRetailMonths={report?.availableRetailMonths ?? []}
        />
        {isManager && report ? (
          <a
            href={`/api/reports/kpis?start=${report.startDate}&end=${report.endDate}&period=${period}&label=${encodeURIComponent(rangeLabel)}`}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-panel px-4 text-sm font-black text-volt transition hover:border-volt"
          >
            <Download size={16} /> Exportar (Excel)
          </a>
        ) : null}
      </div>

      <div className="flex gap-1.5">
        {tabs.map((tab) => (
          <motion.button key={tab.id} onClick={() => setActiveTab(tab.id)} whileTap={{ scale: 0.96 }} className={`relative min-h-10 rounded-full px-5 text-sm font-black transition ${activeTab === tab.id ? "text-white" : "text-muted hover:text-ink"}`}>
            {activeTab === tab.id ? <motion.span layoutId="desktop-kpi-tab" className="absolute inset-0 rounded-full bg-volt shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} /> : null}
            <span className="relative">{tab.label}</span>
          </motion.button>
        ))}
      </div>

      {error ? <Card className="bg-rose-50 text-sm font-semibold text-rose-700 dark:bg-rose-950/30">{error}</Card> : null}
      {loading ? (
        <div className="space-y-4"><Skeleton className="h-36 rounded-[28px]" /><div className="grid grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-[28px]" />)}</div></div>
      ) : activeKpi ? (
        <AnimatePresence mode="wait">
          <motion.div key={`${activeTab}-${period}-${selectedDate}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {activeTab === "resumen" ? <ResumenView activeKpi={activeKpi} team={report?.team ?? []} progress={progress} periodLabel={periodLabel} hasDiscountSource={report?.hasDiscountSource ?? false} latestDiscountWeek={report?.latestDiscountWeek ?? null} targets={periodTargets} isManager={isManager} onOpenTargets={() => setShowTargetSheet(true)} salesProjection={monthSalesProjection} /> : null}
            {activeTab === "ventas" ? <VentasView activeKpi={activeKpi} chartData={chartData} team={report?.team ?? []} progress={progress} periodLabel={periodLabel} /> : null}
            {activeTab === "comision" ? <ComisionView activeKpi={commissionKpi ?? activeKpi} rules={report?.commissionRules ?? []} simulatedSales={simulatedSales} setSimulatedSales={setSimulatedSales} activeRule={activeRule} appliedPercent={appliedPercent} simulatedCommission={simulatedCommission} simulatedAchievement={simulatedAchievement} commissionRole={commissionRole} periodLabel={periodLabel} projection={monthProjection} hasMinimum={hasCommissionMinimum} /> : null}
            {activeTab === "ranking" ? <RankingView ranking={report?.team ?? []} periodLabel={periodLabel} isAdvisor={isAdvisor} currentUserId={report?.currentUserId} /> : null}
            {activeTab === "recibo" ? <ReciboView receipts={receipts} loading={receiptsLoading} isManager={isManager} /> : null}
          </motion.div>
        </AnimatePresence>
      ) : <Card className="text-sm font-semibold text-muted">No hay KPIs dentro de {rangeLabel}.</Card>}

      <AnimatePresence>
        {showTargetSheet && isManager ? (
          <TargetSheet
            key="target-sheet"
            targets={periodTargets}
            period={periodKey}
            onClose={() => setShowTargetSheet(false)}
            onSave={(saved) => setTargets((prev) => [...prev.filter((t) => !saved.some((s) => s.metric === t.metric && s.period === t.period)), ...saved])}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PeriodBar({ period, setPeriod, selectedDate, setSelectedDate, rangeLabel, availableWeeks, availableRetailMonths }: { period: KpiPeriod; setPeriod: (period: KpiPeriod) => void; selectedDate: string; setSelectedDate: (date: string) => void; rangeLabel: string; availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>; availableRetailMonths: Array<{ label: string; start: string; end: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-full bg-slate-100 p-1 dark:bg-[#1a2540]" role="group" aria-label="Periodo de KPIs">
        {(["week", "month"] as const).map((option) => (
          <button key={option} type="button" onClick={() => setPeriod(option)} className={`min-h-9 rounded-full px-5 text-sm font-black transition ${period === option ? "bg-white text-volt shadow-sm dark:bg-[#2a3a5c]" : "text-muted"}`}>{option === "week" ? "Semana" : "Mes"}</button>
        ))}
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-panel px-3 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-volt dark:bg-[#1a2540]"><CalendarDays size={17} /></span>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Período</p><p className="truncate text-sm font-black text-ink">{rangeLabel}</p></div>
        {period === "week" ? (
          <select aria-label="Seleccionar semana RDV" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-9 rounded-xl bg-slate-100 px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20 dark:bg-[#1a2540]">{availableWeeks.map((week) => <option key={`${week.weekNumber}-${week.weekStart}`} value={week.weekStart}>Semana {week.weekNumber}</option>)}</select>
        ) : (
          <select aria-label="Seleccionar mes retail" value={availableRetailMonths.find((month) => selectedDate >= month.start && selectedDate <= month.end)?.start ?? availableRetailMonths.at(-1)?.start ?? selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-9 rounded-xl bg-slate-100 px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20 dark:bg-[#1a2540]">{availableRetailMonths.map((month) => <option key={month.start} value={month.start}>{month.label}</option>)}</select>
        )}
      </div>
    </div>
  );
}

const cardItem = { hidden: { opacity: 0, y: 16, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } } };
const cardGrid = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } };

function ResumenView({ activeKpi, team, progress, periodLabel, hasDiscountSource, latestDiscountWeek, targets, isManager, onOpenTargets, salesProjection }: { activeKpi: KpiReportItem; team: KpiReportItem[]; progress: number; periodLabel: string; hasDiscountSource: boolean; latestDiscountWeek: { weekNumber: number; margin: number | null } | null; targets: KpiTarget[]; isManager: boolean; onOpenTargets: () => void; salesProjection?: MonthSalesProjection | null }) {
  const discountValue = activeKpi.discountMargin !== null ? `${activeKpi.discountMargin}%`
    : latestDiscountWeek?.margin !== null && latestDiscountWeek !== null ? `${latestDiscountWeek.margin}%`
    : hasDiscountSource ? "—" : "Sin datos POS";
  const discountDetail = activeKpi.discountMargin !== null ? "Descuento sobre venta bruta"
    : latestDiscountWeek !== null ? `Semana ${latestDiscountWeek.weekNumber}`
    : hasDiscountSource ? "Sin datos este periodo" : "Vincula Descuentos POS";
  const getTarget = (metric: string) => targets.find((t) => t.metric === metric)?.value ?? null;
  function semaphore(value: number | null, metric: string): "green" | "yellow" | "red" | "none" {
    const target = getTarget(metric);
    if (value === null || target === null) return "none";
    if (value >= target) return "green";
    if (value >= target * 0.85) return "yellow";
    return "red";
  }
  const spark = (extractor: (m: KpiReportItem) => number | null) => team.map((m, i) => ({ i, v: extractor(m) ?? 0 }));
  const goalTone = achievementTone(progress);
  const goalToneText = goalTone === "mint" ? "text-success" : goalTone === "ember" ? "text-ember" : "text-orchid";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card className="premium-hero col-span-2 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Cumplimiento {periodLabel}</p>
              <h2 className={cn("mt-1 text-[2.6rem] font-black leading-none", goalToneText)}>{progress}%</h2>
              <p className="mt-1 text-sm text-muted">{money(activeKpi.sales)} de {money(activeKpi.goal)}</p>
              {activeKpi.goal > 0 ? (
                <p className={cn("mt-0.5 text-xs font-black", activeKpi.sales >= activeKpi.goal ? "text-success" : "text-volt")}>
                  {activeKpi.sales >= activeKpi.goal ? `Meta superada por ${money(activeKpi.sales - activeKpi.goal)}` : `Faltan ${money(activeKpi.goal - activeKpi.sales)} para la meta ${periodLabel}`}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {isManager ? (
                <motion.button onClick={onOpenTargets} whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }} className="grid size-10 place-items-center rounded-2xl bg-blue-100/70 text-volt dark:bg-[#1a2540]" aria-label="Configurar metas KPI">
                  <Settings2 size={18} />
                </motion.button>
              ) : null}
              <ProgressRing value={progress} tone={goalTone} size={84} />
            </div>
          </div>
          <ProgressBar value={progress} tone={goalTone} />
        </Card>

        {salesProjection ? (
          <Card className="border border-emerald-400/30 bg-gradient-to-br from-emerald-50 to-blue-50 p-4 dark:from-[#0f2a1e] dark:to-[#11203f]">
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre</p>
            <h2 className="mt-1 text-[1.7rem] font-black leading-none text-ink">{money(salesProjection.projectedSales)}</h2>
            <p className="mt-1.5 text-xs text-muted">{salesProjection.achievement}% de {money(salesProjection.goal)} · ritmo {formatWeeksElapsed(salesProjection.weeksElapsed)}/{salesProjection.totalWeeks} sem.</p>
            <div className="mt-2.5"><ProgressBar value={Math.min(salesProjection.achievement, 100)} /></div>
          </Card>
        ) : (
          <Card className="flex flex-col justify-center p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Transacciones</p>
            <h2 className="mt-1 text-[1.7rem] font-black leading-none text-ink">{activeKpi.transactions}</h2>
            <p className="mt-1.5 text-xs text-muted">Piezas: {activeKpi.pieces} · Tráfico: {activeKpi.traffic ?? "—"}</p>
          </Card>
        )}
      </div>

      <motion.div variants={cardGrid} initial="hidden" animate="show" className="grid grid-cols-3 gap-4">
        <MetricCard metric="upt"         value={activeKpi.upt === null ? "—" : String(activeKpi.upt)}            detail="Unidades por ticket"   sparkData={spark((m) => m.upt)}            trafficLight={semaphore(activeKpi.upt, "upt")} />
        <MetricCard metric="aur"         value={activeKpi.aur === null ? "—" : money(activeKpi.aur)}             detail="Precio promedio pieza" sparkData={spark((m) => m.aur)}            trafficLight={semaphore(activeKpi.aur, "aur")} />
        <MetricCard metric="ept"         value={activeKpi.ept === null ? "—" : money(activeKpi.ept)}             detail="Venta por transacción" sparkData={spark((m) => m.ept)}            trafficLight={semaphore(activeKpi.ept, "ept")} />
        <MetricCard metric="conversion"  value={activeKpi.conversion === null ? "—" : `${activeKpi.conversion}%`} detail={activeKpi.conversion === null ? "Sin tráfico" : "Tickets / Tráfico"} sparkData={spark((m) => m.conversion)}     trafficLight={semaphore(activeKpi.conversion, "conversion")} />
        <MetricCard metric="margen"      value={discountValue}                                                   detail={discountDetail}        sparkData={spark((m) => m.discountMargin)} trafficLight={semaphore(activeKpi.discountMargin, "margen")} />
        <MetricCard metric="achievement" value={`${progress}%`}                                                  detail={`Objetivo ${periodLabel}`} sparkData={team.map((m, i) => ({ i, v: m.achievement }))} trafficLight={semaphore(progress, "achievement")} />
      </motion.div>

      {team.length > 0 ? <TeamTable team={team} /> : null}
    </div>
  );
}

function TeamTable({ team }: { team: KpiReportItem[] }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-lg font-black text-ink">Desempeño por asesor</h2>
      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            <tr>
              <th className="px-4 py-2.5">Asesor</th>
              <th className="px-4 py-2.5 text-right">Venta</th>
              <th className="px-4 py-2.5 text-right">Meta</th>
              <th className="w-36 px-4 py-2.5">Alcance</th>
              <th className="px-4 py-2.5 text-right">UPT</th>
              <th className="px-4 py-2.5 text-right">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {team.map((item) => (
              <tr key={item.userId} className="border-t border-line transition-colors even:bg-slate-50/50 hover:bg-volt/[0.04] dark:even:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="sm" className="size-8 rounded-xl shadow-none" />
                    <span className="font-bold text-ink">{item.userName}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right font-black text-ink">{money(item.sales)}</td>
                <td className="px-4 py-2.5 text-right text-muted">{money(item.goal)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><ProgressBar value={Math.round(item.achievement)} tone={achievementTone(Math.round(item.achievement))} /></div>
                    <span className="w-9 shrink-0 text-right text-xs font-black text-ink">{Math.round(item.achievement)}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-ink">{item.upt === null ? "—" : item.upt}</td>
                <td className="px-4 py-2.5 text-right text-ink">{item.conversion === null ? "—" : `${item.conversion}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MetricCard({ metric, value, detail, sparkData, trafficLight }: { metric: string; value: string; detail: string; sparkData: Array<{ i: number; v: number }>; trafficLight: "green" | "yellow" | "red" | "none" }) {
  const config = METRIC_CONFIG[metric];
  if (!config) return null;
  const { label, gradient, glow, Icon } = config;
  const dotClass = {
    green: "bg-green-300 shadow-[0_0_6px_rgba(134,239,172,0.8)]",
    yellow: "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.8)]",
    red: "bg-rose-300 shadow-[0_0_6px_rgba(252,165,165,0.8)]",
    none: "bg-white/25",
  }[trafficLight];
  return (
    <motion.div variants={cardItem} whileHover={{ scale: 1.03, y: -2 }} className={cn("relative min-h-[130px] overflow-hidden rounded-[28px] p-4", `bg-gradient-to-br ${gradient}`)} style={{ boxShadow: `0 8px 24px ${glow}` }}>
      <span className={cn("absolute right-3 top-3 size-2.5 rounded-full", dotClass)} />
      <span className="inline-grid size-9 place-items-center rounded-[14px] bg-white/20"><Icon size={17} className="text-white" /></span>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">{label}</p>
      <p className="mt-0.5 text-[1.6rem] font-black leading-none tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-white/55">{detail}</p>
      {sparkData.length > 2 ? (
        <div className="pointer-events-none absolute bottom-0 right-0 h-12 w-24 opacity-45">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}><Line type="monotone" dataKey="v" stroke="white" strokeWidth={1.5} dot={false} animationDuration={600} /></LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </motion.div>
  );
}

function VentasView({ activeKpi, chartData, team, progress, periodLabel }: { activeKpi: KpiReportItem; chartData: Array<{ name: string; venta: number; meta: number }>; team: KpiReportItem[]; progress: number; periodLabel: string }) {
  const { isDark } = useTheme();
  const tooltipStyle = isDark
    ? { background: "#1a2540", border: "1px solid #2a3a5c", borderRadius: 12, color: "#f0f4ff", boxShadow: "0 6px 14px rgb(0 0 0 / 0.3)" }
    : { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A", boxShadow: "0 6px 14px rgb(15 23 42 / 0.08)" };
  const data = chartData.length ? chartData : [{ name: activeKpi.userName, venta: activeKpi.sales, meta: activeKpi.goal }];
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Venta vs meta por asesor</h2></div><Badge>{progress}%</Badge></div>
        <div className="h-72 overflow-hidden rounded-xl" style={{ background: "#0f172a" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={team.map((m) => ({ name: m.userName.split(" ")[0], Venta: m.sales, Meta: m.goal }))} margin={{ top: 12, right: 12, left: 8, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => money(v)} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(value) => money(Number(value))} />
              <Bar dataKey="Meta" fill="#94A3B8" radius={[6, 6, 0, 0]} maxBarSize={34} />
              <Bar dataKey="Venta" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-black text-ink">Tendencia de venta</h2>
        <div className="h-56 overflow-hidden rounded-xl" style={{ background: "#0f172a" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs><linearGradient id="kpiSalesD" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.5} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} /></linearGradient></defs>
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value)), "Venta"]} />
              <Area type="monotone" dataKey="venta" stroke="#3B82F6" strokeWidth={2.5} fill="url(#kpiSalesD)" dot={{ r: 4, fill: "#3B82F6", stroke: "#0f172a", strokeWidth: 1.5 }} activeDot={{ r: 6, fill: "#60A5FA", stroke: "#fff", strokeWidth: 2 }} animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-4 gap-4">
        <StatCard compact label={`Venta ${periodLabel}`} value={money(activeKpi.sales)} detail="Acumulada" progress={progress} icon={<ShoppingBag size={15} />} />
        <StatCard compact label={`Meta ${periodLabel}`} value={money(activeKpi.goal)} detail="Suma de metas diarias" tone="sky" icon={<Target size={15} />} />
        <StatCard compact label="Cumplimiento" value={`${progress}%`} detail={`Periodo ${periodLabel}`} tone="purple" progress={progress} icon={<TrendingUp size={15} />} />
        <StatCard compact label="Transacciones" value={String(activeKpi.transactions)} detail="Tickets acumulados" tone="ember" icon={<Receipt size={15} />} />
      </div>
    </div>
  );
}

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel, projection, hasMinimum }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string; projection?: MonthProjection | null; hasMinimum: boolean }) {
  const missingRuleMessage = !hasMinimum ? "Sin mínimo de comisión sincronizado" : `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-4">
        {projection ? (
          <Card className="border border-emerald-400/30 bg-gradient-to-br from-emerald-50 to-blue-50 p-5 dark:from-[#0f2a1e] dark:to-[#11203f]">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p><h2 className="mt-1 text-[2rem] font-black leading-none text-ink">{money(projection.projectedCommission)}</h2><p className="mt-1.5 text-sm text-muted">Al ritmo de tus semanas con datos 💰</p></div>
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-[#10301f]"><TrendingUp size={25} /></span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2"><Mini label="Venta proy." value={money(projection.projectedSales)} /><Mini label="Nivel actual" value={`${projection.percent}%`} /><Mini label="Semanas" value={`${formatWeeksElapsed(projection.weeksElapsed)}/${projection.totalWeeks}`} /></div>
          </Card>
        ) : null}
        <Card className="premium-hero p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Comisión estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-black leading-none text-ink">{hasMinimum ? money(simulatedCommission) : "—"}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-rose-700"}`}>{activeRule ? `${activeRule.commissionPercent}% por nivel actual` : missingRuleMessage}</p></div>
            <span className="grid size-12 place-items-center rounded-2xl bg-violet-50 text-purple dark:bg-[#1a2540]"><Trophy size={25} /></span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Mini label="Porcentaje" value={hasMinimum ? `${appliedPercent}%` : "—"} /><Mini label="Alcance vs mínimo" value={hasMinimum ? `${Math.round(simulatedAchievement)}%` : "—"} /></div>
        </Card>
        <Card className="p-5">
          <div className="mb-2.5 flex items-center gap-2"><Calculator className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Simulador {periodLabel}</h2></div>
          <input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(Math.round(activeKpi.sales))} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-2xl border border-line bg-blue-50 px-4 text-xl font-black text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15 dark:bg-[#1a2540]" />
        </Card>
      </div>
      <Card className="h-fit p-5">
        <div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-black text-ink">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>
        {rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => (
          <div key={rule.id} className="flex items-center justify-between border-t border-line py-3 first:border-0">
            <div><p className="font-black text-ink">{rule.minAchievement}% a {rule.maxAchievement ?? "más"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div>
            <Badge tone={rule.id === activeRule?.id ? "success" : "default"}>{rule.commissionPercent}%</Badge>
          </div>
        ))}
      </Card>
    </div>
  );
}

type RankMetricId = "venta" | "conversion" | "upt" | "ept";
const RANK_METRICS: { id: RankMetricId; label: string; get: (item: KpiReportItem) => number | null; fmt: (value: number) => string }[] = [
  { id: "venta", label: "Venta", get: (item) => item.sales, fmt: (value) => money(value) },
  { id: "conversion", label: "Conversión", get: (item) => item.conversion, fmt: (value) => `${value.toFixed(1)}%` },
  { id: "upt", label: "UPT", get: (item) => item.upt, fmt: (value) => value.toFixed(2) },
  { id: "ept", label: "Ticket", get: (item) => item.ept, fmt: (value) => money(value) }
];

function RankingView({ ranking, periodLabel, isAdvisor, currentUserId }: { ranking: KpiReportItem[]; periodLabel: string; isAdvisor?: boolean; currentUserId?: string }) {
  const { isDark } = useTheme();
  const [metricId, setMetricId] = useState<RankMetricId>("venta");
  const metric = RANK_METRICS.find((item) => item.id === metricId) ?? RANK_METRICS[0];
  const tooltipStyle = isDark
    ? { background: "#1a2540", border: "1px solid #2a3a5c", borderRadius: 12, color: "#f0f4ff", boxShadow: "0 6px 14px rgb(0 0 0 / 0.3)" }
    : { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A", boxShadow: "0 6px 14px rgb(15 23 42 / 0.08)" };
  const ranked = useMemo(() => {
    if (isAdvisor) return ranking.map((item) => ({ item, position: item.ranking, value: item.achievement as number | null }));
    const withValue = ranking.map((item) => ({ item, value: metric.get(item) }));
    withValue.sort((left, right) => (right.value ?? -Infinity) - (left.value ?? -Infinity));
    return withValue.map((entry, index) => ({ item: entry.item, position: index + 1, value: entry.value }));
  }, [ranking, isAdvisor, metric]);
  const maxValue = isAdvisor ? 100 : Math.max(1, ...ranked.map((entry) => entry.value ?? 0));
  const data = ranked.map((entry) => ({ name: entry.item.userName.split(" ")[0], valor: isAdvisor ? entry.item.achievement : (entry.value ?? 0) }));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-black text-ink">Ranking {periodLabel}</h2></div>
          {!isAdvisor ? (
            <div className="flex gap-1.5">
              {RANK_METRICS.map((option) => (
                <button key={option.id} type="button" onClick={() => setMetricId(option.id)} className={cn("min-h-9 rounded-full px-3.5 text-[13px] font-black transition", metricId === option.id ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}>{option.label}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="h-64 overflow-hidden rounded-xl" style={{ background: "#0f172a" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => isAdvisor ? [`${value}%`, "Cumplimiento"] : [metric.fmt(Number(value)), metric.label]} />
              <Bar dataKey="valor" fill="#3B82F6" radius={[8, 8, 8, 8]} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="divide-y divide-line p-5">
        {ranked.length ? ranked.map((entry) => {
          const item = entry.item;
          const showValue = !isAdvisor || item.userId === currentUserId;
          const valueLabel = entry.value === null ? "—" : metric.fmt(entry.value);
          return (
            <div key={item.userId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="md" />
                  <div><h3 className="font-black text-ink">{entry.position === 1 ? "👑 " : ""}{item.userName}</h3><p className="text-sm text-muted">#{entry.position}{showValue ? ` · ${isAdvisor ? money(item.sales) : valueLabel}` : ""}</p></div>
                </div>
                {entry.position === 1 ? <Badge tone="warn">Líder</Badge> : <Badge>{Math.round(item.achievement)}%</Badge>}
              </div>
              <ProgressBar value={isAdvisor ? item.achievement : Math.round(((entry.value ?? 0) / maxValue) * 100)} />
            </div>
          );
        }) : <p className="text-sm font-semibold text-muted">No hay asesores con datos en este periodo.</p>}
      </Card>
    </div>
  );
}

function ReciboView({ receipts, loading, isManager }: { receipts: ReceiptMonth[] | null; loading: boolean; isManager: boolean }) {
  if (loading || receipts === null) return <Card className="text-sm font-semibold text-muted">Cargando recibos…</Card>;
  if (receipts.length === 0) return <Card className="p-5"><p className="font-black text-ink">Sin recibos</p><p className="mt-2 text-sm text-muted">Aquí aparecerá un recibo de comisión por cada mes con datos.</p></Card>;
  return (
    <div className="grid grid-cols-2 gap-4">
      {receipts.map((month) => (
        <Card key={month.start} className="h-fit p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Receipt className="text-volt" size={18} /><h2 className="text-lg font-black capitalize text-ink">{month.label}</h2></div>
            <Badge tone={month.isCurrent ? "warn" : "default"}>{month.isCurrent ? "En curso" : "Cerrado"}</Badge>
          </div>
          <ReceiptBody line={month.main} highlight />
          {isManager && month.team.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Por asesor</p>
              <div className="space-y-2.5">
                {month.team.map((line) => (
                  <div key={line.name} className="rounded-2xl bg-panel p-3">
                    <div className="mb-1.5 flex items-center gap-2.5"><ProfileAvatar name={line.name} photoUrl={line.photoUrl} size="sm" /><p className="min-w-0 truncate font-black text-ink">{line.name}</p></div>
                    <ReceiptBody line={line} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function ReceiptBody({ line, highlight }: { line: ReceiptLine; highlight?: boolean }) {
  if (!line.hasMinimum) {
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <ReceiptRow label="Venta" value={money(line.sales)} />
        <ReceiptRow label="Mínimo" value="—" />
        <ReceiptRow label="Alcance" value="—" />
        <ReceiptRow label="Comisión" value="—" />
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        <ReceiptRow label="Venta" value={money(line.sales)} />
        <ReceiptRow label="Mínimo" value={money(line.minimum)} />
        <ReceiptRow label="Alcance" value={`${line.achievement.toFixed(1)}%`} />
        <ReceiptRow label="Nivel" value={line.percent > 0 ? `${line.percent}%` : "—"} />
      </div>
      <div className={cn("mt-2.5 flex items-center justify-between rounded-2xl px-3 py-2.5", highlight ? "bg-volt/10 ring-1 ring-volt/30" : "bg-panel")}>
        <span className="text-sm font-black text-muted">Comisión</span>
        <span className="text-lg font-black text-ink">{money(line.commission)}</span>
      </div>
    </>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted">{label}</span><span className="font-black text-ink">{value}</span></div>;
}

function TargetSheet({ targets, period, onClose, onSave }: { targets: KpiTarget[]; period: "SEMANA" | "MES"; onClose: () => void; onSave: (saved: KpiTarget[]) => void }) {
  const getInitial = (metric: string) => targets.find((t) => t.metric === metric)?.value.toString() ?? "";
  const [form, setForm] = useState<Record<string, string>>({
    upt: getInitial("upt"), aur: getInitial("aur"), ept: getInitial("ept"), conversion: getInitial("conversion"), achievement: getInitial("achievement"),
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function handleSave() {
    setSaving(true);
    setStatus("Guardando…");
    const entries = Object.entries(form).filter(([, v]) => v !== "" && !isNaN(Number(v)));
    const saved: KpiTarget[] = [];
    try {
      for (const [metric, value] of entries) {
        const response = await fetch("/api/kpi-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric, value: Number(value), period }) });
        const payload = await response.json() as { target?: KpiTarget };
        if (payload.target) saved.push(payload.target);
      }
      onSave(saved);
      setStatus("Metas guardadas.");
      setTimeout(onClose, 700);
    } catch {
      setStatus("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const editableMetrics = ["upt", "aur", "ept", "conversion", "achievement"] as const;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink">Metas KPI — {period === "SEMANA" ? "Semana" : "Mes"}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-slate-100 text-ink dark:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {editableMetrics.map((metric) => {
            const config = METRIC_CONFIG[metric];
            return (
              <div key={metric}>
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{config?.targetLabel}</label>
                <input type="number" min="0" step="0.01" value={form[metric]} onChange={(e) => setForm((prev) => ({ ...prev, [metric]: e.target.value }))} placeholder={metric === "upt" ? "Ej: 1.5" : metric === "conversion" ? "Ej: 25" : "Ej: 50000"} className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-slate-50 px-4 text-sm font-bold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15 dark:bg-slate-800/50" />
              </div>
            );
          })}
        </div>
        {status ? <p className={cn("mt-3 text-sm font-semibold", status.includes("guardadas") ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>{status}</p> : null}
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="mt-4 min-h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-black text-white shadow-[0_8px_30px_rgba(37,99,235,0.35)] transition active:scale-95 disabled:opacity-60">{saving ? "Guardando…" : "Guardar metas"}</button>
      </motion.div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="px-2"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p><p className="mt-1 font-black text-ink">{value}</p></div>; }
