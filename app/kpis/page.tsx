"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3, Calculator, CalendarDays, Download, Percent, Receipt, Settings2, ShoppingBag, Target, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSession } from "@/lib/auth";
import { findCommissionRule, projectMonthlyCommission, resolveCommissionMinimum } from "@/lib/commission";
import { completion, money } from "@/lib/format";
import { periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { achievementTone, AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing, Skeleton, StatCard } from "@/components/ui";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

type Tab = "resumen" | "ventas" | "comision" | "ranking" | "recibo";
type KpiTarget = { id: string; metric: string; value: number; period: string };
type MonthProjection = { weeksElapsed: number; totalWeeks: number; projectedSales: number; projectedCommission: number; percent: number; achievement: number };
type MonthSalesProjection = { weeksElapsed: number; totalWeeks: number; projectedSales: number; goal: number; achievement: number };
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
  hasDiscountSource: boolean;
  latestDiscountWeek: { weekNumber: number; margin: number | null } | null;
};

interface MetricConfig {
  label: string;
  gradient: string;
  glow: string;
  Icon: LucideIcon;
  targetLabel: string;
}

const METRIC_CONFIG: Record<string, MetricConfig> = {
  upt:         { label: "UPT",          gradient: "from-blue-500 to-blue-700",     glow: "rgba(59,130,246,0.32)",  Icon: ShoppingBag, targetLabel: "Meta UPT"           },
  aur:         { label: "AUR",          gradient: "from-sky-400 to-cyan-600",      glow: "rgba(14,165,233,0.32)",  Icon: Receipt,     targetLabel: "Meta AUR ($)"       },
  ept:         { label: "EPT",          gradient: "from-violet-500 to-purple-700", glow: "rgba(139,92,246,0.32)",  Icon: BarChart3,   targetLabel: "Meta EPT ($)"       },
  conversion:  { label: "Conversión",   gradient: "from-orange-400 to-amber-600",  glow: "rgba(251,146,60,0.32)",  Icon: Target,      targetLabel: "Meta Conversión (%)" },
  margen:      { label: "Margen DTO",   gradient: "from-rose-500 to-pink-700",     glow: "rgba(244,63,94,0.32)",   Icon: Percent,     targetLabel: "Límite DTO (%)"     },
  achievement: { label: "Cumplimiento", gradient: "from-emerald-500 to-teal-700",  glow: "rgba(16,185,129,0.32)",  Icon: TrendingUp,  targetLabel: "Meta cumplimiento (%)" },
};

const tabs: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "ventas", label: "Ventas" },
  { id: "comision", label: "Comision" },
  { id: "ranking", label: "Ranking" },
  { id: "recibo", label: "Recibo" }
];

type ReceiptLine = { name: string; photoUrl: string | null; sales: number; minimum: number; achievement: number; percent: number; commission: number; hasMinimum: boolean };
type ReceiptMonth = { label: string; start: string; isCurrent: boolean; main: ReceiptLine; team: ReceiptLine[] };

// Mismo cálculo que la pestaña Comisión: alcance = venta ÷ mínimo, nivel por bracket.
// No modifica la lógica de comisión, sólo reutiliza los helpers existentes.
function computeReceiptLine(scope: { userName?: string; photoUrl?: string | null; sales: number; goal: number; commissionMinimum: number | null }, role: Role, rules: CommissionRule[]): ReceiptLine {
  const minimum = resolveCommissionMinimum(scope.commissionMinimum, scope.goal);
  const hasMinimum = minimum > 0;
  const achievement = hasMinimum ? (scope.sales / minimum) * 100 : 0;
  const rule = hasMinimum ? findCommissionRule(rules, role, achievement) : undefined;
  const percent = rule?.commissionPercent ?? 0;
  return {
    name: scope.userName ?? "",
    photoUrl: scope.photoUrl ?? null,
    sales: scope.sales,
    minimum,
    achievement,
    percent,
    commission: hasMinimum ? scope.sales * (percent / 100) : 0,
    hasMinimum
  };
}

export default function KpisPage() {
  const [session, setSession] = useState<User | null>(null);
  const [report, setReport] = useState<KpiResponse | null>(null);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  // Dirección del deslizamiento al cambiar de período: mes entra desde la derecha (+1),
  // semana desde la izquierda (-1). En 0 se usa el fade vertical de siempre (tabs/fechas).
  const [slideDir, setSlideDir] = useState(0);
  const [simulatedSales, setSimulatedSales] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showTargetSheet, setShowTargetSheet] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptMonth[] | null>(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

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
  }, [period, selectedDate, session, refreshTick]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/kpi-targets")
      .then((r) => r.json() as Promise<{ targets?: KpiTarget[] }>)
      .then((payload) => { if (payload.targets) setTargets(payload.targets); })
      .catch(() => undefined);
  }, [session]);

  // Recibo histórico: un cierre de comisión por cada mes retail disponible. Reutiliza
  // /api/kpis (mismo cálculo del período) y computa la comisión con los mismos helpers.
  useEffect(() => {
    if (activeTab !== "recibo" || !session || !report || receipts !== null) return;
    const months = report.availableRetailMonths;
    if (months.length === 0) { setReceipts([]); return; }
    const manager = session.role !== "ASESOR";
    const todayKey = localDateKey(new Date());
    const controller = new AbortController();
    setReceiptsLoading(true);
    Promise.all(months.map((month) =>
      fetch(`/api/kpis?period=month&date=${month.start}`, { cache: "no-store", signal: controller.signal })
        .then((r) => r.json() as Promise<KpiResponse>)
        .then((payload): ReceiptMonth | null => {
          const scope = manager ? payload.store : payload.own;
          if (!scope) return null;
          const main = computeReceiptLine(scope, manager ? session.role : "ASESOR", payload.commissionRules);
          const team = manager
            ? payload.team.filter((item) => item.role === "ASESOR").map((item) => computeReceiptLine(item, "ASESOR", payload.commissionRules))
            : [];
          return { label: month.label, start: month.start, isCurrent: todayKey >= month.start && todayKey <= month.end, main, team };
        })
        .catch(() => null)
    ))
      .then((list) => {
        if (controller.signal.aborted) return;
        setReceipts(list.filter((month): month is ReceiptMonth => month !== null).sort((a, b) => b.start.localeCompare(a.start)));
      })
      .finally(() => { if (!controller.signal.aborted) setReceiptsLoading(false); });
    return () => controller.abort();
  }, [activeTab, session, report, receipts]);

  const isAdvisor = session?.role === "ASESOR";
  const isManager = !isAdvisor;
  const activeKpi = isAdvisor ? (report?.own ?? null) : (report?.store ?? null);
  const periodLabel = period === "week" ? "semanal" : "mensual";
  const progress = completion(activeKpi?.sales ?? 0, activeKpi?.goal ?? 0);
  const commissionKpi = isAdvisor ? (report?.own ?? null) : (report?.store ?? null);
  const initialSimulation = simulatedSales ? Number(simulatedSales) : commissionKpi?.sales ?? 0;
  // El alcance para comisión SIEMPRE se mide contra el MÍNIMO (nunca contra la meta).
  // Si no hay mínimo sincronizado, se deriva de la meta (meta ÷ 1.15).
  const commissionBase = resolveCommissionMinimum(commissionKpi?.commissionMinimum ?? null, commissionKpi?.goal ?? 0);
  const hasCommissionMinimum = commissionBase > 0;
  const simulatedAchievement = hasCommissionMinimum ? getAchievement(initialSimulation, commissionBase) : 0;
  const commissionRole = isAdvisor ? "ASESOR" : session?.role ?? "GERENTE";
  const activeRule = hasCommissionMinimum ? findCommissionRule(report?.commissionRules ?? [], commissionRole, simulatedAchievement) : undefined;
  const appliedPercent = activeRule?.commissionPercent ?? 0;
  const simulatedCommission = hasCommissionMinimum ? initialSimulation * (appliedPercent / 100) : 0;
  const chartData = report?.team.map((item) => ({ name: item.userName, venta: item.sales, meta: item.goal })) ?? [];
  const rangeLabel = report ? formatPeriodLabel(report.period, report.startDate, report.endDate, report.weekNumber, report.retailMonthLabel) : "Cargando periodo";
  const periodKey = period === "week" ? "SEMANA" : "MES";
  const periodTargets = useMemo(() => targets.filter((t) => t.period === periodKey), [targets, periodKey]);

  // Semanas con datos del mes retail en curso (base de todas las proyecciones).
  // Metas/mínimo/horarios se cargan semana por semana → se proyecta por semanas.
  const monthWeeks = useMemo<{ weeksElapsed: number; totalWeeks: number } | null>(() => {
    if (!report || report.period !== "month") return null;
    const start = new Date(`${report.startDate}T00:00:00Z`);
    const end = new Date(`${report.endDate}T00:00:00Z`);
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    if (todayUtc < start || todayUtc > end) return null; // solo el mes en curso
    const dayMs = 86_400_000;
    const totalWeeks = Math.max(1, Math.round(((end.getTime() - start.getTime()) / dayMs + 1) / 7));
    const weeksWithData = report.availableWeeks.filter((week) => {
      const ws = new Date(`${week.weekStart}T00:00:00Z`);
      return ws >= start && ws <= end && ws <= todayUtc;
    }).length;
    const calendarWeeksElapsed = Math.ceil(((todayUtc.getTime() - start.getTime()) / dayMs + 1) / 7);
    const weeksElapsed = Math.min(totalWeeks, Math.max(1, weeksWithData || calendarWeeksElapsed));
    return { weeksElapsed, totalWeeks };
  }, [report]);

  // Proyección de COMISIÓN (pestaña Comisión). Reutiliza projectMonthlyCommission.
  const monthProjection = useMemo<MonthProjection | null>(() => {
    if (!monthWeeks || !report || !commissionKpi || commissionKpi.sales <= 0) return null;
    const result = projectMonthlyCommission({
      salesToDate: commissionKpi.sales,
      minimumToDate: resolveCommissionMinimum(commissionKpi.commissionMinimum ?? null, commissionKpi.goal),
      weeksElapsed: monthWeeks.weeksElapsed,
      totalWeeks: monthWeeks.totalWeeks,
      rules: report.commissionRules,
      role: commissionRole
    });
    return result ? { ...monthWeeks, ...result } : null;
  }, [monthWeeks, report, commissionKpi, commissionRole]);

  // Proyección de VENTA de cierre de mes de TIENDA (pestaña Resumen, solo gerencia).
  // La meta mensual de tienda viene completa (TOTALES), así que se compara directo.
  const monthSalesProjection = useMemo<MonthSalesProjection | null>(() => {
    if (!monthWeeks || !isManager || !activeKpi || activeKpi.sales <= 0 || activeKpi.goal <= 0) return null;
    const projectedSales = (activeKpi.sales / monthWeeks.weeksElapsed) * monthWeeks.totalWeeks;
    const achievement = Math.round((projectedSales / activeKpi.goal) * 100);
    return { ...monthWeeks, projectedSales, goal: activeKpi.goal, achievement };
  }, [monthWeeks, isManager, activeKpi]);

  return (
    <>
      <AppHeader title="KPIs" subtitle={isAdvisor ? "Tus indicadores por periodo." : "Venta, metas y ranking del equipo."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <PullToRefresh onRefresh={() => { setRefreshTick((t) => t + 1); return new Promise((r) => setTimeout(r, 700)); }}>
      <AppFrame>
        <PeriodSelector period={period} setPeriod={(next) => { if (next !== period) { setSlideDir(next === "month" ? 1 : -1); setPeriod(next); } }} selectedDate={selectedDate} setSelectedDate={(date) => { setSlideDir(0); setSelectedDate(date); }} rangeLabel={rangeLabel} availableWeeks={report?.availableWeeks ?? []} availableRetailMonths={report?.availableRetailMonths ?? []} />

        {isAdvisor && report ? <Card className="mb-3 p-3"><p className="text-sm font-black text-ink">{report.workedDays ? "Calculado sobre tus dias laborados" : "Sin dias laborados en este periodo"}</p><p className="mt-1 text-xs font-semibold text-muted">Dias laborados: {report.workedDays ?? 0}</p></Card> : null}

        {isManager && report ? (
          <a
            href={`/api/reports/kpis?start=${report.startDate}&end=${report.endDate}&period=${period}&label=${encodeURIComponent(rangeLabel)}`}
            className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-panel text-sm font-black text-volt transition hover:border-volt active:scale-95"
          >
            <Download size={16} /> Exportar reporte (Excel)
          </a>
        ) : null}

        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1">
          {tabs.map((tab) => (
            <motion.button key={tab.id} onClick={() => { setSlideDir(0); setActiveTab(tab.id); }} whileTap={{ scale: 0.96 }} className={`relative min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black transition ${activeTab === tab.id ? "text-white" : "text-muted hover:text-ink"}`}>
              {activeTab === tab.id ? <motion.span layoutId="kpi-tab-active" className="absolute inset-0 rounded-full bg-volt shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} /> : null}
              <span className="relative">{tab.label}</span>
            </motion.button>
          ))}
        </div>

        {error ? <Card className="mb-3 bg-rose-50 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {loading ? <div className="space-y-3"><Skeleton className="h-32 rounded-[28px]" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[28px]" />)}</div></div> : activeKpi ? (
          <AnimatePresence mode="wait">
            <motion.div key={`${activeTab}-${period}-${selectedDate}`} initial={{ opacity: 0, x: slideDir * 30, y: slideDir === 0 ? 8 : 0 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: slideDir * -22 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              {activeTab === "resumen" ? <ResumenView activeKpi={activeKpi} team={report?.team ?? []} progress={progress} periodLabel={periodLabel} hasDiscountSource={report?.hasDiscountSource ?? false} latestDiscountWeek={report?.latestDiscountWeek ?? null} targets={periodTargets} isManager={isManager} onOpenTargets={() => setShowTargetSheet(true)} salesProjection={monthSalesProjection} /> : null}
              {activeTab === "ventas" ? <VentasView activeKpi={activeKpi} chartData={chartData} progress={progress} periodLabel={periodLabel} /> : null}
              {activeTab === "comision" ? <ComisionView activeKpi={commissionKpi ?? activeKpi} rules={report?.commissionRules ?? []} simulatedSales={simulatedSales} setSimulatedSales={setSimulatedSales} activeRule={activeRule} appliedPercent={appliedPercent} simulatedCommission={simulatedCommission} simulatedAchievement={simulatedAchievement} commissionRole={commissionRole} periodLabel={periodLabel} projection={monthProjection} hasMinimum={hasCommissionMinimum} /> : null}
              {activeTab === "ranking" ? <RankingView ranking={report?.team ?? []} periodLabel={periodLabel} isAdvisor={isAdvisor} currentUserId={report?.currentUserId} /> : null}
              {activeTab === "recibo" ? <ReciboView receipts={receipts} loading={receiptsLoading} isManager={isManager} /> : null}
            </motion.div>
          </AnimatePresence>
        ) : <Card className="text-sm font-semibold text-muted">No hay KPIs dentro de {rangeLabel}.</Card>}
      </AppFrame>
      </PullToRefresh>
      <BottomNav />
      <AnimatePresence>
        {showTargetSheet && isManager ? (
          <TargetSheet
            key="target-sheet"
            targets={periodTargets}
            period={periodKey}
            onClose={() => setShowTargetSheet(false)}
            onSave={(saved) => {
              setTargets((prev) => {
                const out = prev.filter((t) => !saved.some((s) => s.metric === t.metric && s.period === t.period));
                return [...out, ...saved];
              });
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function PeriodSelector({ period, setPeriod, selectedDate, setSelectedDate, rangeLabel, availableWeeks, availableRetailMonths }: { period: KpiPeriod; setPeriod: (period: KpiPeriod) => void; selectedDate: string; setSelectedDate: (date: string) => void; rangeLabel: string; availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>; availableRetailMonths: Array<{ label: string; start: string; end: string }> }) {
  return (
    <Card className="mb-3 p-3">
      <div className="flex rounded-full bg-slate-100 dark:bg-[#1a2540] p-1" role="group" aria-label="Periodo de KPIs">
        {(["week", "month"] as const).map((option) => <button key={option} type="button" onClick={() => setPeriod(option)} className={`min-h-10 flex-1 rounded-full text-sm font-black transition ${period === option ? "bg-white dark:bg-[#2a3a5c] text-volt shadow-sm" : "text-muted"}`}>{option === "week" ? "Semana" : "Mes"}</button>)}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 dark:bg-[#1a2540] text-volt"><CalendarDays size={18} /></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-muted">Periodo seleccionado</p><p className="truncate text-sm font-black text-ink">{rangeLabel}</p></div>
        {period === "week" ? <select aria-label="Seleccionar semana RDV" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 w-[8.3rem] rounded-xl bg-slate-100 dark:bg-[#1a2540] px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20">{availableWeeks.map((week) => <option key={`${week.weekNumber}-${week.weekStart}`} value={week.weekStart}>Semana {week.weekNumber}</option>)}</select> : <select aria-label="Seleccionar mes retail" value={availableRetailMonths.find((month) => selectedDate >= month.start && selectedDate <= month.end)?.start ?? availableRetailMonths.at(-1)?.start ?? selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 w-[8.3rem] rounded-xl bg-slate-100 dark:bg-[#1a2540] px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20">{availableRetailMonths.map((month) => <option key={month.start} value={month.start}>{month.label}</option>)}</select>}
      </div>
    </Card>
  );
}

const cardItem = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } }
};

const cardGrid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } }
};

function ResumenView({ activeKpi, team, progress, periodLabel, hasDiscountSource, latestDiscountWeek, targets, isManager, onOpenTargets, salesProjection }: { activeKpi: KpiReportItem; team: KpiReportItem[]; progress: number; periodLabel: string; hasDiscountSource: boolean; latestDiscountWeek: { weekNumber: number; margin: number | null } | null; targets: KpiTarget[]; isManager: boolean; onOpenTargets: () => void; salesProjection?: MonthSalesProjection | null }) {
  const discountValue = activeKpi.discountMargin !== null
    ? `${activeKpi.discountMargin}%`
    : latestDiscountWeek?.margin !== null && latestDiscountWeek !== null
      ? `${latestDiscountWeek.margin}%`
      : hasDiscountSource ? "—" : "Sin datos POS";
  const discountDetail = activeKpi.discountMargin !== null
    ? "Descuento sobre venta bruta"
    : latestDiscountWeek !== null
      ? `Semana ${latestDiscountWeek.weekNumber}`
      : hasDiscountSource ? "Sin datos este periodo" : "Vincula Descuentos POS";

  const getTarget = (metric: string) => targets.find((t) => t.metric === metric)?.value ?? null;

  function semaphore(value: number | null, metric: string): "green" | "yellow" | "red" | "none" {
    const target = getTarget(metric);
    if (value === null || target === null) return "none";
    if (value >= target) return "green";
    if (value >= target * 0.85) return "yellow";
    return "red";
  }

  const spark = (extractor: (m: KpiReportItem) => number | null) =>
    team.map((m, i) => ({ i, v: extractor(m) ?? 0 }));

  // Color del cumplimiento: verde ≥100%, ámbar 90–99%, rojo <90%.
  const goalTone = achievementTone(progress);
  const goalToneText = goalTone === "mint" ? "text-success" : goalTone === "ember" ? "text-ember" : "text-orchid";

  return (
    <>
      <Card className="premium-hero mb-3 px-4 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Cumplimiento {periodLabel}</p>
            <h2 className={cn("mt-1 text-[2.25rem] font-black leading-none", goalToneText)}>{progress}%</h2>
            <p className="mt-1 text-xs text-muted">{money(activeKpi.sales)} de {money(activeKpi.goal)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isManager ? (
              <motion.button
                onClick={onOpenTargets}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.08 }}
                className="grid size-10 place-items-center rounded-2xl bg-blue-100/70 dark:bg-[#1a2540] text-volt"
                aria-label="Configurar metas KPI"
              >
                <Settings2 size={18} />
              </motion.button>
            ) : null}
            <ProgressRing value={progress} tone={goalTone} size={68} />
          </div>
        </div>
        <ProgressBar value={progress} tone={goalTone} />
      </Card>

      {salesProjection ? (
        <Card className="mb-3 border border-emerald-400/30 bg-gradient-to-br from-emerald-50 to-blue-50 p-3.5 dark:from-[#0f2a1e] dark:to-[#11203f]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p>
              <h2 className="mt-1 text-[1.9rem] font-black leading-none text-ink">{money(salesProjection.projectedSales)}</h2>
              <p className="mt-1.5 text-sm text-muted">{salesProjection.achievement}% de la meta {money(salesProjection.goal)} · al ritmo de las semanas con datos ({salesProjection.weeksElapsed}/{salesProjection.totalWeeks})</p>
            </div>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-[#10301f]"><TrendingUp size={25} /></span>
          </div>
          <div className="mt-2.5"><ProgressBar value={Math.min(salesProjection.achievement, 100)} /></div>
        </Card>
      ) : null}

      <motion.div variants={cardGrid} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
        <MetricCard metric="upt"         value={activeKpi.upt === null ? "—" : String(activeKpi.upt)}                                   detail="Unidades por ticket"               sparkData={spark((m) => m.upt)}            trafficLight={semaphore(activeKpi.upt, "upt")} />
        <MetricCard metric="aur"         value={activeKpi.aur === null ? "—" : money(activeKpi.aur)}                                    detail="Precio promedio pieza"             sparkData={spark((m) => m.aur)}            trafficLight={semaphore(activeKpi.aur, "aur")} />
        <MetricCard metric="ept"         value={activeKpi.ept === null ? "—" : money(activeKpi.ept)}                                    detail="Venta por transacción"             sparkData={spark((m) => m.ept)}            trafficLight={semaphore(activeKpi.ept, "ept")} />
        <MetricCard metric="conversion"  value={activeKpi.conversion === null ? "—" : `${activeKpi.conversion}%`}                       detail={activeKpi.conversion === null ? "Sin tráfico" : "Tickets / Tráfico"}  sparkData={spark((m) => m.conversion)}     trafficLight={semaphore(activeKpi.conversion, "conversion")} />
        <MetricCard metric="margen"      value={discountValue}                                                                          detail={discountDetail}                    sparkData={spark((m) => m.discountMargin)} trafficLight={semaphore(activeKpi.discountMargin, "margen")} />
        <MetricCard metric="achievement" value={`${progress}%`}                                                                        detail={`Objetivo ${periodLabel}`}         sparkData={team.map((m, i) => ({ i, v: m.achievement }))} trafficLight={semaphore(progress, "achievement")} />
      </motion.div>
    </>
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
    <motion.div
      variants={cardItem}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={cn("relative min-h-[118px] overflow-hidden rounded-[28px] p-3.5", `bg-gradient-to-br ${gradient}`)}
      style={{ boxShadow: `0 8px 24px ${glow}` }}
    >
      <span className={cn("absolute right-3 top-3 size-2.5 rounded-full", dotClass)} />

      <span className="inline-grid size-8 place-items-center rounded-[14px] bg-white/20">
        <Icon size={15} className="text-white" />
      </span>

      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">{label}</p>
      <p className="mt-0.5 text-[1.36rem] font-black leading-none tracking-[-0.03em] text-white">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-white/55">{detail}</p>

      {sparkData.length > 2 ? (
        <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-20 opacity-45">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <Line type="monotone" dataKey="v" stroke="white" strokeWidth={1.5} dot={false} animationDuration={600} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </motion.div>
  );
}

function TargetSheet({ targets, period, onClose, onSave }: { targets: KpiTarget[]; period: "SEMANA" | "MES"; onClose: () => void; onSave: (saved: KpiTarget[]) => void }) {
  const getInitial = (metric: string) => targets.find((t) => t.metric === metric)?.value.toString() ?? "";
  const [form, setForm] = useState<Record<string, string>>({
    upt: getInitial("upt"),
    aur: getInitial("aur"),
    ept: getInitial("ept"),
    conversion: getInitial("conversion"),
    achievement: getInitial("achievement"),
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function handleSave() {
    setSaving(true);
    setStatus("Guardando...");
    const entries = Object.entries(form).filter(([, v]) => v !== "" && !isNaN(Number(v)));
    const saved: KpiTarget[] = [];
    try {
      for (const [metric, value] of entries) {
        const response = await fetch("/api/kpi-targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric, value: Number(value), period }),
        });
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 380 }}
        className="w-full max-w-lg rounded-t-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink">Metas KPI — {period === "SEMANA" ? "Semana" : "Mes"}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-slate-100 dark:bg-slate-800 text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3">
          {editableMetrics.map((metric) => {
            const config = METRIC_CONFIG[metric];
            return (
              <div key={metric}>
                <label className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{config?.targetLabel}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[metric]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [metric]: e.target.value }))}
                  placeholder={metric === "upt" ? "Ej: 1.5" : metric === "conversion" ? "Ej: 25" : "Ej: 50000"}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-slate-50 dark:bg-slate-800/50 px-4 text-sm font-bold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15"
                />
              </div>
            );
          })}
        </div>
        {status ? (
          <p className={cn("mt-3 text-sm font-semibold", status.includes("guardadas") ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>
            {status}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="mt-4 min-h-12 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-black text-white shadow-[0_8px_30px_rgba(37,99,235,0.35)] transition active:scale-95 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar metas"}
        </button>
      </motion.div>
    </div>
  );
}

function VentasView({ activeKpi, chartData, progress, periodLabel }: { activeKpi: KpiReportItem; chartData: Array<{ name: string; venta: number; meta: number }>; progress: number; periodLabel: string }) {
  const { isDark } = useTheme();
  const tooltipStyle = isDark
    ? { background: "#1a2540", border: "1px solid #2a3a5c", borderRadius: 12, color: "#f0f4ff", boxShadow: "0 6px 14px rgb(0 0 0 / 0.3)" }
    : { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A", boxShadow: "0 6px 14px rgb(15 23 42 / 0.08)" };
  const data = chartData.length ? chartData : [{ name: activeKpi.userName, venta: activeKpi.sales, meta: activeKpi.goal }];
  return <><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp className="text-volt" size={18} /><h2 className="text-lg font-black">Ventas {periodLabel}s</h2></div><Badge>{progress}%</Badge></div><div className="h-44 rounded-xl overflow-hidden" style={{ background: "#0f172a" }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="kpiSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.5} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} /></linearGradient></defs><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} /><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value)), "Venta"]} /><Area type="monotone" dataKey="venta" stroke="#3B82F6" strokeWidth={2.5} fill="url(#kpiSales)" dot={{ r: 4, fill: "#3B82F6", stroke: "#0f172a", strokeWidth: 1.5 }} activeDot={{ r: 6, fill: "#60A5FA", stroke: "#fff", strokeWidth: 2 }} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></AreaChart></ResponsiveContainer></div></Card><div className="grid grid-cols-2 gap-3"><StatCard compact label={`Venta ${periodLabel}`} value={money(activeKpi.sales)} detail="Acumulada" progress={progress} icon={<ShoppingBag size={15} />} /><StatCard compact label={`Meta ${periodLabel}`} value={money(activeKpi.goal)} detail="Suma de metas diarias" tone="sky" icon={<Target size={15} />} /><StatCard compact label="Cumplimiento" value={`${progress}%`} detail={`Periodo ${periodLabel}`} tone="purple" progress={progress} icon={<TrendingUp size={15} />} /><StatCard compact label="Transacciones" value={String(activeKpi.transactions)} detail="Tickets acumulados" tone="ember" icon={<Receipt size={15} />} /></div></>;
}

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel, projection, hasMinimum }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string; projection?: MonthProjection | null; hasMinimum: boolean }) {
  const missingRuleMessage = !hasMinimum ? "Sin mínimo de comisión sincronizado" : `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  return <>{projection ? <Card className="mb-3 border border-emerald-400/30 bg-gradient-to-br from-emerald-50 to-blue-50 p-3.5 dark:from-[#0f2a1e] dark:to-[#11203f]"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p><h2 className="mt-1 text-[2rem] font-black leading-none text-ink">{money(projection.projectedCommission)}</h2><p className="mt-1.5 text-sm text-muted">Al ritmo de tus semanas con datos 💰</p></div><span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-[#10301f]"><TrendingUp size={25} /></span></div><div className="mt-2.5 grid grid-cols-3 gap-2"><Mini label="Venta proy." value={money(projection.projectedSales)} /><Mini label="Nivel actual" value={`${projection.percent}%`} /><Mini label="Semanas" value={`${projection.weeksElapsed}/${projection.totalWeeks}`} /></div></Card> : null}<Card className="premium-hero mb-3 p-3.5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Comision estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-black leading-none text-ink">{hasMinimum ? money(simulatedCommission) : "—"}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-rose-700"}`}>{activeRule ? `${activeRule.commissionPercent}% por nivel actual` : missingRuleMessage}</p></div><span className="grid size-12 place-items-center rounded-2xl bg-violet-50 dark:bg-[#1a2540] text-purple"><Trophy size={25} /></span></div><div className="mt-2.5 grid grid-cols-2 gap-2"><Mini label="Porcentaje" value={hasMinimum ? `${appliedPercent}%` : "—"} /><Mini label="Alcance vs mínimo" value={hasMinimum ? `${Math.round(simulatedAchievement)}%` : "—"} /></div></Card><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center gap-2"><Calculator className="text-volt" size={18} /><h2 className="text-lg font-black">Simulador {periodLabel}</h2></div><input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(Math.round(activeKpi.sales))} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-2xl border border-line bg-blue-50 dark:bg-[#1a2540] px-4 text-xl font-black text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15" /></Card><Card className="p-3.5"><div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-black">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>{rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => <div key={rule.id} className="flex items-center justify-between border-t border-line py-2.5 first:border-0"><div><p className="font-black">{rule.minAchievement}% a {rule.maxAchievement ?? "mas"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div><Badge tone={rule.id === activeRule?.id ? "success" : "default"}>{rule.commissionPercent}%</Badge></div>)}</Card></>;
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

  // Asesor: vista por cumplimiento (sin datos de otros). Gerencia: ranking por métrica.
  const ranked = useMemo(() => {
    if (isAdvisor) return ranking.map((item) => ({ item, position: item.ranking, value: item.achievement as number | null }));
    const withValue = ranking.map((item) => ({ item, value: metric.get(item) }));
    withValue.sort((left, right) => (right.value ?? -Infinity) - (left.value ?? -Infinity));
    return withValue.map((entry, index) => ({ item: entry.item, position: index + 1, value: entry.value }));
  }, [ranking, isAdvisor, metric]);

  const maxValue = isAdvisor ? 100 : Math.max(1, ...ranked.map((entry) => entry.value ?? 0));
  const data = ranked.map((entry) => ({ name: entry.item.userName, valor: isAdvisor ? entry.item.achievement : (entry.value ?? 0) }));

  return <>
    <Card className="mb-3 p-3.5">
      <div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-black">Ranking {periodLabel}</h2></div><Badge>equipo</Badge></div>
      {!isAdvisor ? (
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {RANK_METRICS.map((option) => (
            <button key={option.id} type="button" onClick={() => setMetricId(option.id)} className={cn("min-h-9 shrink-0 rounded-full px-3 text-[13px] font-black transition active:scale-95", metricId === option.id ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}>{option.label}</button>
          ))}
        </div>
      ) : null}
      <div className="h-28 rounded-xl overflow-hidden" style={{ background: "#0f172a" }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} /><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => isAdvisor ? [`${value}%`, "Cumplimiento"] : [metric.fmt(Number(value)), metric.label]} /><Bar dataKey="valor" fill="#3B82F6" radius={[8, 8, 8, 8]} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></BarChart></ResponsiveContainer></div>
    </Card>
    <Card className="divide-y divide-line p-3.5">{ranked.length ? ranked.map((entry) => {
      const item = entry.item;
      const showValue = !isAdvisor || item.userId === currentUserId;
      const valueLabel = entry.value === null ? "—" : metric.fmt(entry.value);
      return <div key={item.userId} className="py-3 first:pt-0 last:pb-0"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="md" /><div><h3 className="font-black">{entry.position === 1 ? "👑 " : ""}{item.userName}</h3><p className="text-sm text-muted">#{entry.position}{showValue ? ` · ${isAdvisor ? money(item.sales) : valueLabel}` : ""}</p></div></div>{entry.position === 1 ? <Badge tone="warn">Líder</Badge> : <Badge>{Math.round(item.achievement)}%</Badge>}</div><ProgressBar value={isAdvisor ? item.achievement : Math.round(((entry.value ?? 0) / maxValue) * 100)} /></div>;
    }) : <p className="text-sm font-semibold text-muted">No hay asesores con datos en este periodo.</p>}</Card>
  </>;
}

function ReciboView({ receipts, loading, isManager }: { receipts: ReceiptMonth[] | null; loading: boolean; isManager: boolean }) {
  if (loading || receipts === null) return <Card className="text-sm font-semibold text-muted">Cargando recibos...</Card>;
  if (receipts.length === 0) return <Card><p className="font-black">Sin recibos</p><p className="mt-2 text-sm text-muted">Aquí aparecerá un recibo de comisión por cada mes con datos.</p></Card>;
  return (
    <div className="space-y-3">
      {receipts.map((month) => (
        <Card key={month.start} className="p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="text-volt" size={18} />
              <h2 className="text-lg font-black capitalize">{month.label}</h2>
            </div>
            <Badge tone={month.isCurrent ? "warn" : "default"}>{month.isCurrent ? "En curso" : "Cerrado"}</Badge>
          </div>
          <ReceiptBody line={month.main} highlight />
          {isManager && month.team.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-muted">Por asesor</p>
              <div className="space-y-2.5">
                {month.team.map((line) => (
                  <div key={line.name} className="rounded-2xl bg-panel p-3">
                    <div className="mb-1.5 flex items-center gap-2.5">
                      <ProfileAvatar name={line.name} photoUrl={line.photoUrl} size="sm" />
                      <p className="min-w-0 truncate font-black text-ink">{line.name}</p>
                    </div>
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
        <ReceiptRow label="Comisión" value="—" strong />
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
      <div className={cn("mt-2.5 flex items-center justify-between rounded-2xl px-3 py-2.5", highlight ? "bg-volt/10 ring-1 ring-volt/30" : "bg-white/[0.04]")}>
        <span className="text-sm font-black text-muted">Comisión</span>
        <span className="text-lg font-black text-ink">{money(line.commission)}</span>
      </div>
    </>
  );
}

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-muted">{label}</span><span className={cn("font-black", strong ? "text-ink" : "text-ink")}>{value}</span></div>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="px-2"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p><p className="mt-1 font-black text-ink">{value}</p></div>; }

function getAchievement(sales: number, goal: number) { return goal > 0 ? (sales / goal) * 100 : 0; }
function localDateKey(date: Date) { return periodDateKey(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))); }
function formatPeriodLabel(period: KpiPeriod, startValue: string, endValue: string, weekNumber: number | null, retailMonthLabel: string | null) { const start = new Date(`${startValue}T00:00:00Z`); const end = new Date(`${endValue}T00:00:00Z`); const startLabel = start.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); if (period === "month") return `${retailMonthLabel ?? "Mes retail"} · ${startLabel} - ${endLabel}`; return `Semana ${weekNumber ?? "RDV"} · ${startLabel} - ${endLabel}`; }
