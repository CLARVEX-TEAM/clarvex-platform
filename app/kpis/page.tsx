"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Calculator, CalendarDays, Download, Receipt, Settings2, ShoppingBag, Target, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { computeNextBracketGap, resolveCommissionMinimum } from "@/lib/commission";
import { money } from "@/lib/format";
import type { KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { KPI_TABS as tabs, METRIC_ACCENT, METRIC_CONFIG, formatWeeksElapsed, localDateKey, type KpiTab as Tab, type KpiTarget, type MonthProjection, type MonthSalesProjection, type ReceiptLine, type ReceiptMonth } from "@/lib/kpi-view";
import { useKpiDerived, useKpiReceipts, useKpiReport, useKpiTargets } from "@/lib/use-kpis";
import { achievementTone, AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing, Skeleton, StatCard } from "@/components/ui";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

export default function KpisPage() {
  const [session, setSession] = useState<User | null>(null);
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  // Dirección del deslizamiento al cambiar de período: mes entra desde la derecha (+1),
  // semana desde la izquierda (-1). En 0 se usa el fade vertical de siempre (tabs/fechas).
  const [slideDir, setSlideDir] = useState(0);
  const [simulatedSales, setSimulatedSales] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showTargetSheet, setShowTargetSheet] = useState(false);

  useEffect(() => { getSession().then(setSession); }, []);

  // iOS: al volver al frente, refrescar para no quedar pegado en el esqueleto.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setRefreshTick((tick) => tick + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Al recargar el reporte se limpia la simulación de comisión.
  useEffect(() => { setSimulatedSales(""); }, [period, selectedDate, refreshTick]);

  const { report, loading, error } = useKpiReport({ session, period, selectedDate, setSelectedDate, refreshTick });
  const { targets, setTargets } = useKpiTargets(session);
  const { receipts, receiptsLoading } = useKpiReceipts({ activeTab, session, report, period, selectedDate });
  const {
    isAdvisor, isManager, activeKpi, periodLabel, progress, commissionKpi,
    hasCommissionMinimum, simulatedAchievement, commissionRole, activeRule,
    appliedPercent, simulatedCommission, chartData, rangeLabel, periodKey,
    periodTargets, monthProjection, monthSalesProjection
  } = useKpiDerived({ session, report, period, targets, simulatedSales });

  return (
    <>
      <AppHeader title="KPIs" subtitle={isAdvisor ? "Tus indicadores por periodo." : "Venta, metas y ranking del equipo."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <PullToRefresh onRefresh={() => { setRefreshTick((t) => t + 1); return new Promise((r) => setTimeout(r, 700)); }}>
      <AppFrame>
        <PeriodSelector period={period} setPeriod={(next) => { if (next !== period) { setSlideDir(next === "month" ? 1 : -1); setPeriod(next); } }} selectedDate={selectedDate} setSelectedDate={(date) => { setSlideDir(0); setSelectedDate(date); }} rangeLabel={rangeLabel} availableWeeks={report?.availableWeeks ?? []} availableRetailMonths={report?.availableRetailMonths ?? []} />

        {isAdvisor && report ? <Card className="mb-3 p-3"><p className="text-sm font-black text-ink">{report.workedDays ? "Calculado sobre tus dias laborados" : "Sin dias laborados en este periodo"}</p><p className="mt-1 text-xs font-semibold text-muted">Dias laborados: {report.workedDays ?? 0}</p></Card> : null}

        {isManager && report ? (
          <a
            href={`/api/reports/kpis?start=${report.startDate}&end=${report.endDate}&period=${period}&label=${encodeURIComponent(rangeLabel)}${report.weekNumber ? `&week=${report.weekNumber}` : ""}`}
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
      <div className="flex rounded-full bg-panel p-1" role="group" aria-label="Periodo de KPIs">
        {(["week", "month"] as const).map((option) => <button key={option} type="button" onClick={() => setPeriod(option)} className={`min-h-10 flex-1 rounded-full text-sm font-black transition ${period === option ? "bg-card dark:bg-line text-volt shadow-sm" : "text-muted"}`}>{option === "week" ? "Semana" : "Mes"}</button>)}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-volt/10 text-volt"><CalendarDays size={18} /></span>
        <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-muted">Periodo seleccionado</p><p className="truncate text-sm font-black text-ink">{rangeLabel}</p></div>
        {period === "week" ? <select aria-label="Seleccionar semana RDV" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 w-[8.3rem] rounded-xl bg-panel px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20">{availableWeeks.map((week) => <option key={`${week.weekNumber}-${week.weekStart}`} value={week.weekStart}>Semana {week.weekNumber}</option>)}</select> : <select aria-label="Seleccionar mes retail" value={availableRetailMonths.find((month) => selectedDate >= month.start && selectedDate <= month.end)?.start ?? availableRetailMonths.at(-1)?.start ?? selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-10 w-[8.3rem] rounded-xl bg-panel px-2 text-xs font-bold text-ink outline-none focus:ring-4 focus:ring-volt/20">{availableRetailMonths.map((month) => <option key={month.start} value={month.start}>{month.label}</option>)}</select>}
      </div>
    </Card>
  );
}


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
            {activeKpi.goal > 0 ? (
              <p className={cn("mt-0.5 text-xs font-black", activeKpi.sales >= activeKpi.goal ? "text-success" : "text-volt")}>
                {activeKpi.sales >= activeKpi.goal ? `Meta superada por ${money(activeKpi.sales - activeKpi.goal)}` : `Faltan ${money(activeKpi.goal - activeKpi.sales)} para la meta ${periodLabel}`}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isManager ? (
              <motion.button
                onClick={onOpenTargets}
                whileTap={{ scale: 0.9 }}
                className="grid size-10 place-items-center rounded-2xl bg-volt/10 text-volt"
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
              <p className="mt-1.5 text-sm text-muted">{salesProjection.achievement}% de la meta {money(salesProjection.goal)} · al ritmo de las semanas con datos ({formatWeeksElapsed(salesProjection.weeksElapsed)}/{salesProjection.totalWeeks})</p>
            </div>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success/10 text-success"><TrendingUp size={25} /></span>
          </div>
          <div className="mt-2.5"><ProgressBar value={Math.min(salesProjection.achievement, 100)} /></div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <MetricCard metric="upt"         value={activeKpi.upt === null ? "—" : String(activeKpi.upt)}                                   detail="Unidades por ticket"               sparkData={spark((m) => m.upt)}            trafficLight={semaphore(activeKpi.upt, "upt")} />
        <MetricCard metric="aur"         value={activeKpi.aur === null ? "—" : money(activeKpi.aur)}                                    detail="Precio promedio pieza"             sparkData={spark((m) => m.aur)}            trafficLight={semaphore(activeKpi.aur, "aur")} />
        <MetricCard metric="ept"         value={activeKpi.ept === null ? "—" : money(activeKpi.ept)}                                    detail="Venta por transacción"             sparkData={spark((m) => m.ept)}            trafficLight={semaphore(activeKpi.ept, "ept")} />
        <MetricCard metric="conversion"  value={activeKpi.conversion === null ? "—" : `${activeKpi.conversion}%`}                       detail={activeKpi.conversion === null ? "Sin tráfico" : "Tickets / Tráfico"}  sparkData={spark((m) => m.conversion)}     trafficLight={semaphore(activeKpi.conversion, "conversion")} />
        <MetricCard metric="margen"      value={discountValue}                                                                          detail={discountDetail}                    sparkData={spark((m) => m.discountMargin)} trafficLight={semaphore(activeKpi.discountMargin, "margen")} />
        <MetricCard metric="achievement" value={`${progress}%`}                                                                        detail={`Objetivo ${periodLabel}`}         sparkData={team.map((m, i) => ({ i, v: m.achievement }))} trafficLight={semaphore(progress, "achievement")} />
      </div>
    </>
  );
}

function MetricCard({ metric, value, detail, sparkData, trafficLight }: { metric: string; value: string; detail: string; sparkData: Array<{ i: number; v: number }>; trafficLight: "green" | "yellow" | "red" | "none" }) {
  const config = METRIC_CONFIG[metric];
  const accent = METRIC_ACCENT[metric];
  if (!config || !accent) return null;
  const { label, Icon } = config;

  // Semáforo vs meta configurada: única señal de color de estado en la tarjeta.
  const dotClass = {
    green: "bg-success",
    yellow: "bg-ember",
    red: "bg-orchid",
    none: "bg-line",
  }[trafficLight];

  return (
    <div className="solid-card relative min-h-[118px] overflow-hidden rounded-[28px] p-3.5">
      <span className={cn("absolute right-3 top-3 size-2.5 rounded-full", dotClass)} />

      <span className={cn("inline-grid size-8 place-items-center rounded-[14px]", accent.chip)}>
        <Icon size={15} />
      </span>

      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-0.5 text-[1.36rem] font-black leading-none tracking-[-0.03em] text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted">{detail}</p>

      {sparkData.length > 2 ? (
        <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-20 opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <Line type="monotone" dataKey="v" stroke={accent.spark} strokeWidth={1.5} dot={false} animationDuration={600} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
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
        className="w-full max-w-lg rounded-t-3xl bg-card dark:bg-panel p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-ink">Metas KPI — {period === "SEMANA" ? "Semana" : "Mes"}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-panel dark:bg-line/60 text-ink">
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
                  className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-panel px-4 text-sm font-bold text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15"
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
          className="mt-4 min-h-12 w-full rounded-2xl bg-volt text-sm font-black text-white shadow-[0_8px_20px_rgb(37_99_235_/_0.22)] transition hover:bg-[#1D4ED8] active:scale-95 disabled:opacity-60"
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
  // La gráfica vive directo sobre la card, en los colores del tema: nada de
  // cajas oscuras hardcodeadas en tema claro.
  const tickFill = isDark ? "#8899BB" : "#64748B";
  const gridStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.07)";
  const dotStroke = isDark ? "#1a2540" : "#FFFFFF";
  return <><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp className="text-volt" size={18} /><h2 className="text-lg font-black">Ventas {periodLabel === "semanal" ? "de la semana" : "del mes"}</h2></div><Badge>{progress}%</Badge></div><div className="h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="kpiSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} /></linearGradient></defs><XAxis dataKey="name" tick={{ fill: tickFill, fontSize: 9 }} axisLine={false} tickLine={false} /><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [money(Number(value)), "Venta"]} /><Area type="monotone" dataKey="venta" stroke="#2563EB" strokeWidth={2.5} fill="url(#kpiSales)" dot={{ r: 4, fill: "#2563EB", stroke: dotStroke, strokeWidth: 1.5 }} activeDot={{ r: 6, fill: "#3B82F6", stroke: dotStroke, strokeWidth: 2 }} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></AreaChart></ResponsiveContainer></div></Card><div className="grid grid-cols-2 gap-3"><StatCard compact label={`Venta ${periodLabel}`} value={money(activeKpi.sales)} detail="Acumulada" progress={progress} icon={<ShoppingBag size={15} />} /><StatCard compact label={`Meta ${periodLabel}`} value={money(activeKpi.goal)} detail="Suma de metas diarias" tone="sky" icon={<Target size={15} />} /><StatCard compact label="Cumplimiento" value={`${progress}%`} detail={`Periodo ${periodLabel}`} tone="purple" progress={progress} icon={<TrendingUp size={15} />} /><StatCard compact label="Transacciones" value={String(activeKpi.transactions)} detail="Tickets acumulados" tone="ember" icon={<Receipt size={15} />} /></div></>;
}

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel, projection, hasMinimum }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string; projection?: MonthProjection | null; hasMinimum: boolean }) {
  const missingRuleMessage = !hasMinimum ? "Sin mínimo de comisión sincronizado" : `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  // "¿Cuánto me falta?" — venta restante para el siguiente bracket de comisión.
  const bracketGap = hasMinimum && activeKpi.sales > 0
    ? computeNextBracketGap({ sales: activeKpi.sales, minimum: resolveCommissionMinimum(activeKpi.commissionMinimum ?? null, activeKpi.goal), rules, role: commissionRole })
    : null;
  return <>{bracketGap ? (
    bracketGap.atTop ? (
      <Card className="mb-3 border border-amber-400/40 bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 dark:from-[#2a2110] dark:to-[#241a0d]">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-2xl">🏆</span>
          <div>
            <h2 className="text-lg font-black leading-tight text-ink">¡Nivel máximo de comisión!</h2>
            <p className="mt-0.5 text-sm font-semibold text-muted">Ya ganas el {bracketGap.currentPercent}% — mantén el ritmo.</p>
          </div>
        </div>
      </Card>
    ) : (
      <Card className="mb-3 border border-volt/25 bg-gradient-to-br from-blue-50 to-indigo-50 p-3.5 dark:from-[#101c3a] dark:to-[#141233]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Te faltan</p>
            <h2 className="mt-1 text-[2rem] font-black leading-none text-ink">{money(bracketGap.salesNeeded)}</h2>
            <p className="mt-1.5 text-sm text-muted">para el {bracketGap.targetAchievement}% y subir tu comisión de {bracketGap.currentPercent}% a <span className="font-black text-volt">{bracketGap.nextPercent}%</span></p>
          </div>
          <span className="grid size-12 place-items-center rounded-2xl bg-volt/10 text-2xl">🎯</span>
        </div>
        {bracketGap.extraCommission > 0 ? <div className="mt-2.5"><Mini label="Comisión extra estimada" value={`+${money(bracketGap.extraCommission)}`} /></div> : null}
      </Card>
    )
  ) : null}{projection ?<Card className="mb-3 border border-emerald-400/30 bg-gradient-to-br from-emerald-50 to-blue-50 p-3.5 dark:from-[#0f2a1e] dark:to-[#11203f]"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p><h2 className="mt-1 text-[2rem] font-black leading-none text-ink">{money(projection.projectedCommission)}</h2><p className="mt-1.5 text-sm text-muted">Al ritmo de tus semanas con datos 💰</p></div><span className="grid size-12 place-items-center rounded-2xl bg-success/10 text-success"><TrendingUp size={25} /></span></div><div className="mt-2.5 grid grid-cols-3 gap-2"><Mini label="Venta proy." value={money(projection.projectedSales)} /><Mini label="Nivel actual" value={`${projection.percent}%`} /><Mini label="Semanas" value={`${formatWeeksElapsed(projection.weeksElapsed)}/${projection.totalWeeks}`} /></div></Card> : null}<Card className="premium-hero mb-3 p-3.5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Comision estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-black leading-none text-ink">{hasMinimum ? money(simulatedCommission) : "—"}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-rose-700"}`}>{activeRule ? `${activeRule.commissionPercent}% por nivel actual` : missingRuleMessage}</p></div><span className="grid size-12 place-items-center rounded-2xl bg-purple/10 text-purple"><Trophy size={25} /></span></div><div className="mt-2.5 grid grid-cols-2 gap-2"><Mini label="Porcentaje" value={hasMinimum ? `${appliedPercent}%` : "—"} /><Mini label="Alcance vs mínimo" value={hasMinimum ? `${Math.round(simulatedAchievement)}%` : "—"} /></div></Card><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center gap-2"><Calculator className="text-volt" size={18} /><h2 className="text-lg font-black">Simulador {periodLabel}</h2></div><input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(Math.round(activeKpi.sales))} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-xl font-black text-ink outline-none focus:border-volt focus:ring-4 focus:ring-volt/15" /></Card><Card className="p-3.5"><div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-black">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>{rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => <div key={rule.id} className="flex items-center justify-between border-t border-line py-2.5 first:border-0"><div><p className="font-black">{rule.minAchievement}% a {rule.maxAchievement ?? "mas"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div><Badge tone={rule.id === activeRule?.id ? "success" : "default"}>{rule.commissionPercent}%</Badge></div>)}</Card></>;
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
      <div className="h-28"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><XAxis dataKey="name" tick={{ fill: isDark ? "#8899BB" : "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} /><CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.07)"} vertical={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => isAdvisor ? [`${value}%`, "Cumplimiento"] : [metric.fmt(Number(value)), metric.label]} /><Bar dataKey="valor" fill="#2563EB" radius={[8, 8, 8, 8]} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></BarChart></ResponsiveContainer></div>
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
