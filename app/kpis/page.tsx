"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3, Calculator, CalendarDays, Percent, Receipt, Settings2, ShoppingBag, Target, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSession } from "@/lib/auth";
import { findCommissionRule, projectMonthlyCommission } from "@/lib/commission";
import { completion, money } from "@/lib/format";
import { periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing, StatCard } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

type Tab = "resumen" | "ventas" | "comision" | "ranking";
type KpiTarget = { id: string; metric: string; value: number; period: string };
type MonthProjection = { weeksElapsed: number; totalWeeks: number; projectedSales: number; projectedCommission: number; percent: number; achievement: number };
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
  { id: "ranking", label: "Ranking" }
];

export default function KpisPage() {
  const [session, setSession] = useState<User | null>(null);
  const [report, setReport] = useState<KpiResponse | null>(null);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [simulatedSales, setSimulatedSales] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTargetSheet, setShowTargetSheet] = useState(false);

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

  useEffect(() => {
    if (!session) return;
    fetch("/api/kpi-targets")
      .then((r) => r.json() as Promise<{ targets?: KpiTarget[] }>)
      .then((payload) => { if (payload.targets) setTargets(payload.targets); })
      .catch(() => undefined);
  }, [session]);

  const isAdvisor = session?.role === "ASESOR";
  const isManager = !isAdvisor;
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
  const periodKey = period === "week" ? "SEMANA" : "MES";
  const periodTargets = useMemo(() => targets.filter((t) => t.period === periodKey), [targets, periodKey]);

  // Proyección de cierre de mes por SEMANAS con datos (metas/mínimo/horarios se
  // cargan semana por semana). Reutiliza projectMonthlyCommission. Solo mes en curso.
  const monthProjection = useMemo<MonthProjection | null>(() => {
    if (!report || report.period !== "month" || !commissionKpi || commissionKpi.sales <= 0) return null;
    const start = new Date(`${report.startDate}T00:00:00Z`);
    const end = new Date(`${report.endDate}T00:00:00Z`);
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    if (todayUtc < start || todayUtc > end) return null; // solo proyecta el mes en curso
    const dayMs = 86_400_000;
    const totalWeeks = Math.max(1, Math.round(((end.getTime() - start.getTime()) / dayMs + 1) / 7));
    const weeksWithData = report.availableWeeks.filter((week) => {
      const ws = new Date(`${week.weekStart}T00:00:00Z`);
      return ws >= start && ws <= end && ws <= todayUtc;
    }).length;
    const calendarWeeksElapsed = Math.ceil(((todayUtc.getTime() - start.getTime()) / dayMs + 1) / 7);
    const weeksElapsed = Math.min(totalWeeks, Math.max(1, weeksWithData || calendarWeeksElapsed));
    const result = projectMonthlyCommission({
      salesToDate: commissionKpi.sales,
      minimumToDate: commissionKpi.commissionMinimum ?? commissionKpi.goal ?? 0,
      weeksElapsed,
      totalWeeks,
      rules: report.commissionRules,
      role: commissionRole
    });
    return result ? { weeksElapsed, totalWeeks, ...result } : null;
  }, [report, commissionKpi, commissionRole]);

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
              {activeTab === "resumen" ? <ResumenView activeKpi={activeKpi} team={report?.team ?? []} progress={progress} periodLabel={periodLabel} hasDiscountSource={report?.hasDiscountSource ?? false} latestDiscountWeek={report?.latestDiscountWeek ?? null} targets={periodTargets} isManager={isManager} onOpenTargets={() => setShowTargetSheet(true)} /> : null}
              {activeTab === "ventas" ? <VentasView activeKpi={activeKpi} chartData={chartData} progress={progress} periodLabel={periodLabel} /> : null}
              {activeTab === "comision" ? <ComisionView activeKpi={commissionKpi ?? activeKpi} rules={report?.commissionRules ?? []} simulatedSales={simulatedSales} setSimulatedSales={setSimulatedSales} activeRule={activeRule} appliedPercent={appliedPercent} simulatedCommission={simulatedCommission} simulatedAchievement={simulatedAchievement} commissionRole={commissionRole} periodLabel={periodLabel} projection={monthProjection} /> : null}
              {activeTab === "ranking" ? <RankingView ranking={report?.team ?? []} periodLabel={periodLabel} isAdvisor={isAdvisor} currentUserId={report?.currentUserId} /> : null}
            </motion.div>
          </AnimatePresence>
        ) : <Card className="text-sm font-semibold text-muted">No hay KPIs dentro de {rangeLabel}.</Card>}
      </AppFrame>
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

function ResumenView({ activeKpi, team, progress, periodLabel, hasDiscountSource, latestDiscountWeek, targets, isManager, onOpenTargets }: { activeKpi: KpiReportItem; team: KpiReportItem[]; progress: number; periodLabel: string; hasDiscountSource: boolean; latestDiscountWeek: { weekNumber: number; margin: number | null } | null; targets: KpiTarget[]; isManager: boolean; onOpenTargets: () => void }) {
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

  return (
    <>
      <Card className="premium-hero mb-3 px-4 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Cumplimiento {periodLabel}</p>
            <h2 className="mt-1 text-[2.25rem] font-black leading-none text-ink">{progress}%</h2>
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
            <ProgressRing value={progress} size={68} />
          </div>
        </div>
        <ProgressBar value={progress} />
      </Card>

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

      <p className="mt-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/70">{label}</p>
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
                <label className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{config?.targetLabel}</label>
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

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel, projection }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string; projection?: MonthProjection | null }) {
  const missingRuleMessage = `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  return <>{projection ? <Card className="mb-3 border border-emerald-400/30 bg-gradient-to-br from-emerald-50 to-blue-50 p-3.5 dark:from-[#0f2a1e] dark:to-[#11203f]"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p><h2 className="mt-1 text-[2rem] font-black leading-none text-ink">{money(projection.projectedCommission)}</h2><p className="mt-1.5 text-sm text-muted">Al ritmo de tus semanas con datos 💰</p></div><span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-[#10301f]"><TrendingUp size={25} /></span></div><div className="mt-2.5 grid grid-cols-3 gap-2"><Mini label="Venta proy." value={money(projection.projectedSales)} /><Mini label="Nivel actual" value={`${projection.percent}%`} /><Mini label="Semanas" value={`${projection.weeksElapsed}/${projection.totalWeeks}`} /></div></Card> : null}<Card className="premium-hero mb-3 p-3.5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Comision estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-black leading-none text-ink">{money(simulatedCommission)}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-rose-700"}`}>{activeRule ? `${activeRule.commissionPercent}% por nivel actual` : missingRuleMessage}</p></div><span className="grid size-12 place-items-center rounded-2xl bg-violet-50 dark:bg-[#1a2540] text-purple"><Trophy size={25} /></span></div><div className="mt-2.5 grid grid-cols-2 gap-2"><Mini label="Porcentaje" value={`${appliedPercent}%`} /><Mini label="Cumplimiento" value={`${Math.round(simulatedAchievement)}%`} /></div></Card><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center gap-2"><Calculator className="text-volt" size={18} /><h2 className="text-lg font-black">Simulador {periodLabel}</h2></div><input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(Math.round(activeKpi.sales))} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-2xl border border-line bg-blue-50 dark:bg-[#1a2540] px-4 text-xl font-black text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15" /></Card><Card className="p-3.5"><div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-black">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>{rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => <div key={rule.id} className="flex items-center justify-between border-t border-line py-2.5 first:border-0"><div><p className="font-black">{rule.minAchievement}% a {rule.maxAchievement ?? "mas"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div><Badge tone={rule.id === activeRule?.id ? "success" : "default"}>{rule.commissionPercent}%</Badge></div>)}</Card></>;
}

function RankingView({ ranking, periodLabel, isAdvisor, currentUserId }: { ranking: KpiReportItem[]; periodLabel: string; isAdvisor?: boolean; currentUserId?: string }) {
  const { isDark } = useTheme();
  const tooltipStyle = isDark
    ? { background: "#1a2540", border: "1px solid #2a3a5c", borderRadius: 12, color: "#f0f4ff", boxShadow: "0 6px 14px rgb(0 0 0 / 0.3)" }
    : { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, color: "#0F172A", boxShadow: "0 6px 14px rgb(15 23 42 / 0.08)" };
  const data = ranking.map((item) => ({ name: item.userName, venta: isAdvisor ? item.achievement : item.sales }));
  return <><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-black">Ranking {periodLabel}</h2></div><Badge>equipo</Badge></div><div className="h-28 rounded-xl overflow-hidden" style={{ background: "#0f172a" }}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} /><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => isAdvisor ? [`${value}%`, "Cumplimiento"] : [money(Number(value)), "Venta"]} /><Bar dataKey="venta" fill="#3B82F6" radius={[8, 8, 8, 8]} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></BarChart></ResponsiveContainer></div></Card><Card className="divide-y divide-line p-3.5">{ranking.length ? ranking.map((item) => <div key={item.userId} className="py-3 first:pt-0 last:pb-0"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="md" /><div><h3 className="font-black">{item.ranking === 1 ? "👑 " : ""}{item.userName}</h3><p className="text-sm text-muted">#{item.ranking}{!isAdvisor || item.userId === currentUserId ? ` · ${money(item.sales)}` : ""}</p></div></div>{item.ranking === 1 ? <Badge tone="warn">Líder</Badge> : <Badge>{Math.round(item.achievement)}%</Badge>}</div><ProgressBar value={item.achievement} /></div>) : <p className="text-sm font-semibold text-muted">No hay asesores con datos en este periodo.</p>}</Card></>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="px-2"><p className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{label}</p><p className="mt-1 font-black text-ink">{value}</p></div>; }

function getAchievement(sales: number, goal: number) { return goal > 0 ? (sales / goal) * 100 : 0; }
function localDateKey(date: Date) { return periodDateKey(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))); }
function formatPeriodLabel(period: KpiPeriod, startValue: string, endValue: string, weekNumber: number | null, retailMonthLabel: string | null) { const start = new Date(`${startValue}T00:00:00Z`); const end = new Date(`${endValue}T00:00:00Z`); const startLabel = start.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); if (period === "month") return `${retailMonthLabel ?? "Mes retail"} · ${startLabel} - ${endLabel}`; return `Semana ${weekNumber ?? "RDV"} · ${startLabel} - ${endLabel}`; }
