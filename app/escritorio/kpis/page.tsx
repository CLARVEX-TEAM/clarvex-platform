"use client";

import { useCallback, useMemo, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { barCursor, ChartTooltip, lineCursor, shortName } from "@/components/ChartTooltip";
import { Calculator, CalendarDays, Download, Receipt, Settings2, ShoppingBag, Sparkles, Target, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import { getSession } from "@/lib/auth";
import { computeNextBracketGap, resolveCommissionMinimum } from "@/lib/commission";
import { money } from "@/lib/format";

/** Eje Y de las gráficas: "$450 k" en vez de "450,000.00", que no cabe. */
const compactMoney = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", notation: "compact", maximumFractionDigits: 0
});
import type { KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { paceLabel, paceStatus, periodElapsed } from "@/lib/progress-pace";
import { KPI_TABS as tabs, METRIC_ACCENT, METRIC_CONFIG, metricAchievement, metricStatus, metricStatusText, isCeiling, formatWeeksElapsed, localDateKey, type KpiTab as Tab, type KpiTarget, type MonthProjection, type MonthSalesProjection, type ReceiptLine, type ReceiptMonth } from "@/lib/kpi-view";
import { ElectronicTicketsPanel } from "@/components/ElectronicTicketsPanel";
import { targetValue } from "@/lib/electronic-tickets";
import { useKpiDerived, useKpiReceipts, useKpiReport, useKpiTargets } from "@/lib/use-kpis";
import { Badge, Card, ProfileAvatar, ProgressBar } from "@/components/ui";
import { KpiHistoryView } from "@/components/KpiHistory";
import { useTheme } from "@/components/ThemeProvider";
import { useDesktopChrome } from "@/components/desktop/DesktopChrome";
import { cn } from "@/lib/utils";
import {
  DeskEmpty, DeskMeter, DeskReveal, DeskSection, DeskSkeleton,
  deskTd, deskTdMuted, deskTh, deskThRight, deskThead, deskTr
} from "@/components/desktop/DeskUI";

export default function EscritorioKpis() {
  const { setLastUpdated } = useDesktopChrome();
  const [session, setSession] = useState<User | null>(null);
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [simulatedSales, setSimulatedSales] = useState("");
  const [showTargetSheet, setShowTargetSheet] = useState(false);
  const [iaReport, setIaReport] = useState<any | null>(null);
  const [loadingIaReport, setLoadingIaReport] = useState(false);
  const [showIaReportModal, setShowIaReportModal] = useState(false);

  async function fetchIaReport() {
    if (!report) return;
    setLoadingIaReport(true);
    try {
      const type = period === "month" ? "MONTHLY" : "WEEKLY";
      const res = await fetch(`/api/ai/reports?start=${report.startDate}&end=${report.endDate}&type=${type}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "No se pudo generar el reporte.");
      setIaReport(payload);
      setShowIaReportModal(true);
    } catch (err: any) {
      alert(err.message || "Error al obtener el reporte.");
    } finally {
      setLoadingIaReport(false);
    }
  }

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
    appliedPercent, simulatedCommission, rangeLabel, periodKey,
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
          <div className="flex gap-2">
            <a
              href={`/api/reports/kpis?start=${report.startDate}&end=${report.endDate}&period=${period}&label=${encodeURIComponent(rangeLabel)}${report.weekNumber ? `&week=${report.weekNumber}` : ""}`}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-panel px-4 text-sm font-semibold text-ink/70 transition hover:border-accent"
            >
              <Download size={16} /> Exportar (Excel)
            </a>
            <button
              onClick={() => void fetchIaReport()}
              disabled={loadingIaReport}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-on-accent transition disabled:opacity-50"
            >
              <Sparkles size={16} />
              {loadingIaReport ? "Generando..." : "Reporte IA"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex gap-1.5">
        {tabs.map((tab) => (
          <motion.button key={tab.id} onClick={() => setActiveTab(tab.id)} whileTap={{ scale: 0.96 }} className={`relative min-h-10 rounded-lg px-4 text-ui font-medium transition-colors ${activeTab === tab.id ? "text-on-accent" : "text-muted hover:text-ink"}`}>
            {activeTab === tab.id ? <motion.span layoutId="desktop-kpi-tab" className="absolute inset-0 rounded-lg bg-accent" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} /> : null}
            <span className="relative">{tab.label}</span>
          </motion.button>
        ))}
      </div>

      {error ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-ui text-danger">{error}</p> : null}
      {loading ? (
        // Esqueleto que calca la maqueta nueva: franja partida arriba, tira de
        // seis indicadores debajo. Un bloque genérico no prepara el ojo.
        <div className="space-y-9">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-3">
              <DeskSkeleton className="h-4 w-40" />
              <DeskSkeleton className="h-11 w-32" />
              <DeskSkeleton className="h-4 w-56" />
              <DeskSkeleton className="h-1.5" />
            </div>
            <div className="space-y-3 lg:border-l lg:border-line lg:pl-12">
              <DeskSkeleton className="h-4 w-40" />
              <DeskSkeleton className="h-8 w-44" />
              <DeskSkeleton className="h-4 w-52" />
            </div>
          </div>
          <hr className="desk-rule" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 xl:grid-cols-6 xl:gap-y-0">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <DeskSkeleton className="h-3 w-16" />
                <DeskSkeleton className="h-6 w-20" />
                <DeskSkeleton className="h-7" />
              </div>
            ))}
          </div>
        </div>
      ) : activeKpi ? (
        <AnimatePresence mode="wait">
          <motion.div key={`${activeTab}-${period}-${selectedDate}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {activeTab === "resumen" ? (
              <>
                <ResumenView activeKpi={activeKpi} team={report?.team ?? []} progress={progress} periodLabel={periodLabel} hasDiscountSource={report?.hasDiscountSource ?? false} latestDiscountWeek={report?.latestDiscountWeek ?? null} targets={periodTargets} isManager={isManager} onOpenTargets={() => setShowTargetSheet(true)} salesProjection={monthSalesProjection} periodStart={report?.startDate} periodEnd={report?.endDate} />
                <ElectronicTicketsPanel
                  own={report?.own ?? null}
                  store={report?.store ?? null}
                  team={report?.team ?? []}
                  isAdvisor={isAdvisor}
                  storeTarget={targetValue(periodTargets, "ticketElectronicoTienda")}
                  advisorTarget={targetValue(periodTargets, "ticketElectronicoAsesor")}
                />
              </>
            ) : null}
            {activeTab === "ventas" ? <VentasView activeKpi={activeKpi} team={report?.team ?? []} progress={progress} periodLabel={periodLabel} /> : null}
            {activeTab === "comision" ? <ComisionView activeKpi={commissionKpi ?? activeKpi} rules={report?.commissionRules ?? []} simulatedSales={simulatedSales} setSimulatedSales={setSimulatedSales} activeRule={activeRule} appliedPercent={appliedPercent} simulatedCommission={simulatedCommission} simulatedAchievement={simulatedAchievement} commissionRole={commissionRole} periodLabel={periodLabel} projection={monthProjection} hasMinimum={hasCommissionMinimum} /> : null}
            {activeTab === "ranking" ? <RankingView ranking={report?.team ?? []} periodLabel={periodLabel} isAdvisor={isAdvisor} currentUserId={report?.currentUserId} /> : null}
            {activeTab === "historico" ? <div className="mx-auto max-w-3xl"><KpiHistoryView /></div> : null}
            {activeTab === "recibo" ? <ReciboView receipts={receipts} loading={receiptsLoading} isManager={isManager} /> : null}
          </motion.div>
        </AnimatePresence>
      ) : (
        <DeskEmpty
          title={`Sin KPIs en ${rangeLabel}`}
          hint="Los números aparecen en cuanto el RDV sincroniza el período. Prueba también con otra semana o con la vista de mes."
        />
      )}

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

        {showIaReportModal && iaReport && (
          <motion.div
            key="ia-report-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl desk-floating rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-accent" size={20} />
                  <h3 className="text-sm font-semibold text-ink">{iaReport.title}</h3>
                </div>
                <button
                  onClick={() => setShowIaReportModal(false)}
                  className="rounded-lg bg-panel p-1.5 text-muted transition hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs text-muted leading-relaxed">
                <div>
                  <h4 className="text-caption font-medium text-accent">Resumen Ejecutivo</h4>
                  <p className="mt-1 bg-panel border border-line rounded-xl p-3 text-muted italic">{iaReport.executiveSummary}</p>
                </div>

                <div>
                  <h4 className="text-caption font-medium text-ink">Análisis de Desempeño</h4>
                  <p className="mt-1">{iaReport.performanceAnalysis}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-3">
                    <span className="font-bold text-emerald-400">Fortalezas:</span>
                    <ul className="list-disc list-inside mt-1.5 space-y-1 text-muted text-[11px]">
                      {iaReport.strengths.map((s: string, idx: number) => <li key={idx}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-rose-500/5 border border-rose-500/10 p-3">
                    <span className="font-bold text-rose-400">Oportunidades:</span>
                    <ul className="list-disc list-inside mt-1.5 space-y-1 text-muted text-[11px]">
                      {iaReport.weaknesses.map((w: string, idx: number) => <li key={idx}>{w}</li>)}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3.5 space-y-1.5">
                  <span className="font-bold text-blue-400">Recomendaciones Estratégicas:</span>
                  <ul className="list-decimal list-inside space-y-1">
                    {iaReport.strategicRecommendations.map((r: string, idx: number) => <li key={idx}>{r}</li>)}
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PeriodBar({ period, setPeriod, selectedDate, setSelectedDate, rangeLabel, availableWeeks, availableRetailMonths }: { period: KpiPeriod; setPeriod: (period: KpiPeriod) => void; selectedDate: string; setSelectedDate: (date: string) => void; rangeLabel: string; availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>; availableRetailMonths: Array<{ label: string; start: string; end: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-full bg-panel p-1" role="group" aria-label="Periodo de KPIs">
        {(["week", "month"] as const).map((option) => (
          <button key={option} type="button" onClick={() => setPeriod(option)} className={`min-h-9 rounded-full px-5 text-sm font-semibold transition ${period === option ? "bg-accent text-on-accent" : "text-muted"}`}>{option === "week" ? "Semana" : "Mes"}</button>
        ))}
      </div>
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-panel px-3 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-panel text-accent"><CalendarDays size={17} /></span>
        <div className="min-w-0"><p className="text-caption font-medium text-muted">Período</p><p className="truncate text-sm font-semibold text-ink">{rangeLabel}</p></div>
        {period === "week" ? (
          <select aria-label="Seleccionar semana RDV" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-9 rounded-xl bg-panel px-2 text-caption text-ink outline-none focus:ring-2 focus:ring-accent/40">{availableWeeks.map((week) => <option key={`${week.weekNumber}-${week.weekStart}`} value={week.weekStart}>Semana {week.weekNumber}</option>)}</select>
        ) : (
          <select aria-label="Seleccionar mes retail" value={availableRetailMonths.find((month) => selectedDate >= month.start && selectedDate <= month.end)?.start ?? availableRetailMonths.at(-1)?.start ?? selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="min-h-9 rounded-xl bg-panel px-2 text-caption text-ink outline-none focus:ring-2 focus:ring-accent/40">{availableRetailMonths.map((month) => <option key={month.start} value={month.start}>{month.label}</option>)}</select>
        )}
      </div>
    </div>
  );
}


function ResumenView({ activeKpi, team, progress, periodLabel, hasDiscountSource, latestDiscountWeek, targets, isManager, onOpenTargets, salesProjection , periodStart, periodEnd }: { activeKpi: KpiReportItem; team: KpiReportItem[]; progress: number; periodLabel: string; hasDiscountSource: boolean; latestDiscountWeek: { weekNumber: number; margin: number | null } | null; targets: KpiTarget[]; isManager: boolean; onOpenTargets: () => void; salesProjection?: MonthSalesProjection | null ; periodStart?: string; periodEnd?: string }) {
  const { isDark } = useTheme();
  const discountValue = activeKpi.discountMargin !== null ? `${activeKpi.discountMargin}%`
    : latestDiscountWeek?.margin !== null && latestDiscountWeek !== null ? `${latestDiscountWeek.margin}%`
    : hasDiscountSource ? "—" : "Sin datos POS";
  const discountDetail = activeKpi.discountMargin !== null ? "Descuento sobre venta bruta"
    : latestDiscountWeek !== null ? `Semana ${latestDiscountWeek.weekNumber}`
    : hasDiscountSource ? "Sin datos este periodo" : "Vincula Descuentos POS";

  // Dónde deberías ir HOY según el periodo transcurrido. El color del
  // cumplimiento sale de esto y no del 100%: el día 2 de un mes de cuatro
  // semanas, un 33% va POR DELANTE aunque antes se pintara en rojo.
  const pace = periodStart && periodEnd ? periodElapsed(periodStart, periodEnd) : null;
  const getTarget = (metric: string) => targets.find((t) => t.metric === metric)?.value ?? null;
  // Delegado a lib/kpi-view: el Margen DTO es un TECHO y su semáforo va al revés.
  const semaphore = (value: number | null, metric: string) => metricStatus(value, getTarget(metric), metric);
  const spark = (extractor: (m: KpiReportItem) => number | null) => team.map((m, i) => ({ i, v: extractor(m) ?? 0 }));
  const remaining = Math.max(0, activeKpi.goal - activeKpi.sales);

  return (
    <div className="space-y-9">
      {/* ─── Franja partida: el cumplimiento manda, los números de soporte al
           lado. Antes eran una tarjeta "hero" con anillo Y barra (dos veces el
           mismo dato) más dos tarjetas sueltas. ─────────────────────────────── */}
      <DeskReveal index={0} className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-ui font-medium text-muted">Cumplimiento {periodLabel}</h2>
            {isManager ? (
              <button
                type="button"
                onClick={onOpenTargets}
                className="flex items-center gap-1.5 text-caption font-medium text-accent hover:underline"
              >
                <Settings2 size={13} /> Configurar metas
              </button>
            ) : null}
          </div>

          <p className={cn("mt-2 text-metric font-semibold", (() => {
            const st = paceStatus(progress, pace);
            return st === "cumplida" || st === "adelante" ? "text-ok" : st === "atras" ? "text-danger" : "text-ink";
          })())}>{progress}%</p>
          <p className="mt-2 text-ui text-ink-2">{money(activeKpi.sales)} de {money(activeKpi.goal)}</p>
          <DeskMeter value={progress} pace={pace} className="mt-4" />
          <p className="mt-2 text-caption text-muted">
            {activeKpi.goal <= 0 ? "Sin meta cargada para el período"
              : remaining > 0 ? `Faltan ${money(remaining)}`
              : `Meta superada por ${money(activeKpi.sales - activeKpi.goal)}`}
            {pace !== null && activeKpi.goal > 0 ? ` · ${paceLabel(paceStatus(progress, pace), pace)}` : ""}
          </p>
        </div>

        <div className="lg:border-l lg:border-line lg:pl-12">
          {salesProjection ? (
            <>
              <h2 className="text-ui font-medium text-muted">Proyección de cierre</h2>
              <p className="mt-2 text-h1 font-semibold text-ink">{money(salesProjection.projectedSales)}</p>
              <p className="mt-2 text-ui text-ink-2">
                {salesProjection.achievement}% de {money(salesProjection.goal)}
              </p>
              <p className="mt-1 text-caption text-muted">
                Al ritmo de {formatWeeksElapsed(salesProjection.weeksElapsed)} de {salesProjection.totalWeeks} semanas
              </p>
              <DeskMeter value={salesProjection.achievement} pace={100} className="mt-4" />
            </>
          ) : (
            <h2 className="text-ui font-medium text-muted">Volumen del período</h2>
          )}

          <dl className={cn("grid grid-cols-3 gap-4", salesProjection ? "mt-8 border-t border-line pt-6" : "mt-2")}>
            <div>
              <dt className="text-caption text-muted">Transacciones</dt>
              <dd className="mt-1 text-h3 font-semibold tabular-nums text-ink">{activeKpi.transactions || "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Piezas</dt>
              <dd className="mt-1 text-h3 font-semibold tabular-nums text-ink">{activeKpi.pieces || "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted">Tráfico</dt>
              <dd className="mt-1 text-h3 font-semibold tabular-nums text-ink">{activeKpi.traffic ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </DeskReveal>

      <hr className="desk-rule" />

      {/* ─── Indicadores: una fila separada por reglas. Antes eran seis tarjetas
           idénticas con icono de colores distintos; ahora el color solo marca el
           semáforo contra la meta configurada, y la meta va escrita al lado para
           que la señal no dependa del color. ────────────────────────────────── */}
      <DeskReveal index={1}>
        <section aria-label={`Indicadores ${periodLabel}`}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-3 xl:grid-cols-6 xl:gap-y-0">
            <MetricItem metric="upt" isDark={isDark} raw={activeKpi.upt}
              value={activeKpi.upt === null ? "—" : activeKpi.upt.toFixed(2)}
              detail="Unidades por ticket" target={getTarget("upt")}
              sparkData={spark((m) => m.upt)} trafficLight={semaphore(activeKpi.upt, "upt")} />
            <MetricItem metric="aur" isDark={isDark} raw={activeKpi.aur}
              value={activeKpi.aur === null ? "—" : money(activeKpi.aur)}
              detail="Precio promedio por pieza" target={getTarget("aur")}
              sparkData={spark((m) => m.aur)} trafficLight={semaphore(activeKpi.aur, "aur")} />
            <MetricItem metric="ept" isDark={isDark} raw={activeKpi.ept}
              value={activeKpi.ept === null ? "—" : money(activeKpi.ept)}
              detail="Venta por transacción" target={getTarget("ept")}
              sparkData={spark((m) => m.ept)} trafficLight={semaphore(activeKpi.ept, "ept")} />
            <MetricItem metric="conversion" isDark={isDark} raw={activeKpi.conversion}
              value={activeKpi.conversion === null ? "—" : `${activeKpi.conversion}%`}
              detail={activeKpi.conversion === null ? "Sin tráfico registrado" : "Tickets sobre tráfico"}
              target={getTarget("conversion")}
              sparkData={spark((m) => m.conversion)} trafficLight={semaphore(activeKpi.conversion, "conversion")} />
            <MetricItem metric="margen" isDark={isDark} raw={activeKpi.discountMargin}
              value={discountValue} detail={discountDetail} target={getTarget("margen")}
              sparkData={spark((m) => m.discountMargin)} trafficLight={semaphore(activeKpi.discountMargin, "margen")} />
            <MetricItem metric="achievement" isDark={isDark} raw={progress}
              value={`${progress}%`} detail={`Objetivo ${periodLabel}`} target={getTarget("achievement")}
              sparkData={team.map((m, i) => ({ i, v: m.achievement }))} trafficLight={semaphore(progress, "achievement")} />
          </dl>
        </section>
      </DeskReveal>

      {team.length > 0 ? (
        <>
          <hr className="desk-rule" />
          <DeskReveal index={2}><TeamTable team={team} /></DeskReveal>
        </>
      ) : null}
    </div>
  );
}

function TeamTable({ team }: { team: KpiReportItem[] }) {
  return (
    <DeskSection title={`Desempeño por asesor · ${team.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <caption className="sr-only">Venta, meta, alcance, UPT y conversión de cada asesor en el período</caption>
          <thead className={deskThead}>
            <tr>
              <th scope="col" className={deskTh}>Asesor</th>
              <th scope="col" className={deskThRight}>Venta</th>
              <th scope="col" className={deskThRight}>Meta</th>
              <th scope="col" className={`${deskTh} w-48 pl-8`}>Alcance</th>
              <th scope="col" className={deskThRight}>UPT</th>
              <th scope="col" className={deskThRight}>AUR</th>
              <th scope="col" className={deskThRight}>Conv.</th>
            </tr>
          </thead>
          <tbody>
            {team.map((item) => {
              const achievement = Math.round(item.achievement);
              return (
                <tr key={item.userId} className={deskTr}>
                  <td className={deskTd}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="sm" className="size-7 shrink-0 rounded-lg text-[10px] shadow-none" />
                      <span className="truncate">{item.userName}</span>
                    </div>
                  </td>
                  <td className={`${deskTd} text-right font-medium`}>{money(item.sales)}</td>
                  <td className={`${deskTdMuted} text-right`}>{item.goal > 0 ? money(item.goal) : "—"}</td>
                  <td className="py-2.5 pl-8">
                    <div className="flex items-center gap-2.5">
                      <DeskMeter value={achievement} className="flex-1" />
                      <span className="w-10 shrink-0 text-right text-caption font-medium tabular-nums text-ink">{achievement}%</span>
                    </div>
                  </td>
                  <td className={`${deskTd} text-right tabular-nums`}>{item.upt === null ? "—" : item.upt.toFixed(2)}</td>
                  <td className={`${deskTd} text-right tabular-nums`}>{item.aur === null ? "—" : money(item.aur)}</td>
                  <td className={`${deskTd} text-right tabular-nums`}>{item.conversion === null ? "—" : `${item.conversion}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DeskSection>
  );
}

function MetricItem({ metric, value, raw, detail, target, sparkData, trafficLight, isDark }: {
  metric: string; value: string; raw?: number | null; detail: string; target: number | null;
  sparkData: Array<{ i: number; v: number }>; trafficLight: "green" | "yellow" | "red" | "none"; isDark: boolean;
}) {
  const config = METRIC_CONFIG[metric];
  if (!config) return null;

  const dotClass = { green: "bg-ok", yellow: "bg-warn", red: "bg-danger", none: "bg-line" }[trafficLight];
  const statusText = metricStatusText(trafficLight, metric);
  const achievement = metricAchievement(raw ?? null, target);
  const toneClass = { green: "text-ok", yellow: "text-warn", red: "text-danger", none: "text-muted" }[trafficLight];

  return (
    <div className="min-w-0 xl:border-l xl:border-line xl:pl-5 xl:first:border-l-0 xl:first:pl-0">
      <dt className="flex items-center gap-1.5 text-caption font-medium text-muted">
        <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} aria-hidden />
        <span className="truncate">{config.label}</span>
      </dt>
      <dd className="flex items-baseline gap-2">
        <span className="mt-1 text-h2 font-semibold tabular-nums text-ink">{value}</span>
        {/* El alcance, que es lo que se pregunta: «¿voy bien?». */}
        {achievement !== null ? (
          <span className={cn("text-ui font-semibold tabular-nums", toneClass)}>{achievement}%</span>
        ) : null}
      </dd>
      {/* La meta va escrita: el semáforo deja de ser una señal solo de color. */}
      <p className="mt-0.5 text-caption text-muted">
        {target !== null
          ? <>{isCeiling(metric) ? "Límite" : "Meta"} {target} · <span className="text-ink-2">{statusText}</span></>
          : detail}
      </p>
      {sparkData.length > 2 ? (
        <div className="mt-2 h-7" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={isDark ? "#709DF6" : "#1E5AE2"}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function VentasView({ activeKpi, team, progress, periodLabel }: { activeKpi: KpiReportItem; team: KpiReportItem[]; progress: number; periodLabel: string }) {
  const { isDark } = useTheme();

  // Mismos colores validados que el dashboard: la serie de meta se hunde en
  // luminosidad para separarse de la venta (ΔE 24 en oscuro, 28.7 en claro).
  const salesColor = isDark ? "#709DF6" : "#1E5AE2";
  const goalColor = isDark ? "#60636A" : "#A1A5AC";
  const axisColor = isDark ? "#92969E" : "#636872";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(21,25,32,0.07)";

  const barData = team.map((m) => ({ name: m.userName.split(" ")[0], Venta: m.sales, Meta: m.goal }));

  return (
    <div className="space-y-9">
      <DeskReveal index={0} className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 className="text-ui font-medium text-muted">Venta {periodLabel}</h2>
          <p className="mt-2 text-metric font-semibold text-ink">{money(activeKpi.sales)}</p>
          <p className="mt-2 text-ui text-ink-2">
            <span className={cn("font-semibold", progress >= 100 ? "text-ok" : "text-ink")}>{progress}%</span>
            {" de la meta · "}{money(activeKpi.goal)}
          </p>
          <DeskMeter value={progress} className="mt-4" />
        </div>
        <dl className="grid grid-cols-3 gap-4 lg:border-l lg:border-line lg:pl-12">
          <div>
            <dt className="text-caption text-muted">Transacciones</dt>
            <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{activeKpi.transactions || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Piezas</dt>
            <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{activeKpi.pieces || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">Ticket promedio</dt>
            <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{activeKpi.ept === null ? "—" : money(activeKpi.ept)}</dd>
          </div>
        </dl>
      </DeskReveal>

      <hr className="desk-rule" />

      <DeskReveal index={1}>
        <figure className="m-0">
          <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-ui font-medium text-muted">Venta contra meta por asesor</span>
            {/* Dos series: la leyenda es obligatoria, la identidad nunca puede
                depender solo del color. */}
            <span className="flex items-center gap-4 text-caption text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: salesColor }} /> Venta
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: goalColor }} /> Meta
              </span>
            </span>
          </figcaption>
          <div
            className="mt-4 h-72"
            role="img"
            aria-label={`Venta contra meta de ${team.length} asesores en el período ${periodLabel}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={58} tickFormatter={(v: number) => compactMoney.format(v)} />
                <Tooltip
                  content={<ChartTooltip isDark={isDark} format={money} />}
                  cursor={lineCursor(isDark)}
                />
                {/* La meta va detrás y en gris: es referencia, no una serie par. */}
                <Bar dataKey="Meta" fill={goalColor} radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="Venta" fill={salesColor} radius={[4, 4, 0, 0]} maxBarSize={30} animationDuration={700} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      </DeskReveal>

    </div>
  );
}

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel, projection, hasMinimum }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string; projection?: MonthProjection | null; hasMinimum: boolean }) {
  const missingRuleMessage = !hasMinimum ? "Sin mínimo de comisión sincronizado" : `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  // "¿Cuánto me falta?" — venta restante para el siguiente bracket de comisión.
  const bracketGap = hasMinimum && activeKpi.sales > 0
    ? computeNextBracketGap({ sales: activeKpi.sales, minimum: resolveCommissionMinimum(activeKpi.commissionMinimum ?? null, activeKpi.goal), rules, role: commissionRole })
    : null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        {bracketGap ? (
          bracketGap.atTop ? (
            <Card className="border border-warn/35 bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-2xl">🏆</span>
                <div>
                  <h2 className="text-lg font-semibold leading-tight text-ink">¡Nivel máximo de comisión!</h2>
                  <p className="mt-0.5 text-sm font-semibold text-muted">Ya ganas el {bracketGap.currentPercent}% — mantén el ritmo.</p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="border border-accent/25 bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-caption font-medium text-muted">Te faltan</p>
                  <h2 className="mt-1 text-[2rem] font-semibold leading-none text-ink">{money(bracketGap.salesNeeded)}</h2>
                  <p className="mt-1.5 text-sm text-muted">para el {bracketGap.targetAchievement}% y subir tu comisión de {bracketGap.currentPercent}% a <span className="font-semibold text-accent">{bracketGap.nextPercent}%</span></p>
                </div>
                <span className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-2xl">🎯</span>
              </div>
              {bracketGap.extraCommission > 0 ? <div className="mt-3"><Mini label="Comisión extra estimada" value={`+${money(bracketGap.extraCommission)}`} /></div> : null}
            </Card>
          )
        ) : null}
        {projection ? (
          <Card className="border border-ok/30 bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-caption font-medium text-muted">Proyección de cierre de mes</p><h2 className="mt-1 text-[2rem] font-semibold leading-none text-ink">{money(projection.projectedCommission)}</h2><p className="mt-1.5 text-sm text-muted">Al ritmo de tus semanas con datos 💰</p></div>
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-[#10301f]"><TrendingUp size={25} /></span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2"><Mini label="Venta proy." value={money(projection.projectedSales)} /><Mini label="Nivel actual" value={`${projection.percent}%`} /><Mini label="Semanas" value={`${formatWeeksElapsed(projection.weeksElapsed)}/${projection.totalWeeks}`} /></div>
          </Card>
        ) : null}
        <Card className="premium-hero p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-caption font-medium text-muted">Comisión estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-semibold leading-none text-ink">{hasMinimum ? money(simulatedCommission) : "—"}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-rose-700"}`}>{activeRule ? `${activeRule.commissionPercent}% por nivel actual` : missingRuleMessage}</p></div>
            <span className="grid size-12 place-items-center rounded-2xl bg-panel text-accent"><Trophy size={25} /></span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><Mini label="Porcentaje" value={hasMinimum ? `${appliedPercent}%` : "—"} /><Mini label="Alcance vs mínimo" value={hasMinimum ? `${Math.round(simulatedAchievement)}%` : "—"} /></div>
        </Card>
        <Card className="p-5">
          <div className="mb-2.5 flex items-center gap-2"><Calculator className="text-accent" size={18} /><h2 className="text-lg font-semibold text-ink">Simulador {periodLabel}</h2></div>
          <input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(Math.round(activeKpi.sales))} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-xl border border-line bg-panel px-4 text-h3 font-semibold text-ink outline-none transition-colors focus:border-accent" />
        </Card>
      </div>
      <Card className="h-fit p-5">
        <div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-semibold text-ink">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>
        {rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => (
          <div key={rule.id} className="flex items-center justify-between border-t border-line py-3 first:border-0">
            <div><p className="font-semibold text-ink">{rule.minAchievement}% a {rule.maxAchievement ?? "más"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div>
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
          <div className="flex items-center gap-2"><UsersRound className="text-accent" size={18} /><h2 className="text-lg font-semibold text-ink">Ranking {periodLabel}</h2></div>
          {!isAdvisor ? (
            <div className="flex gap-1.5">
              {RANK_METRICS.map((option) => (
                <button key={option.id} type="button" onClick={() => setMetricId(option.id)} className={cn("min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition", metricId === option.id ? "bg-accent text-on-accent" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}>{option.label}</button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 12, left: 8, bottom: 0 }}>
              <XAxis dataKey="name" tickFormatter={shortName} interval={0} tick={{ fill: isDark ? "#8899BB" : "#64748B", fontSize: 11 }} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"} vertical={false} />
              {/* El `cursor` es OBLIGATORIO aquí. Sin él, recharts pinta por
                  omisión una franja gris muy clara del alto de toda la barra,
                  que sobre el lienzo oscuro se ve como un recuadro blanco que
                  tapa la barra al pasar el ratón. */}
              <Tooltip
                content={<ChartTooltip isDark={isDark} format={(v) => (isAdvisor ? `${v}%` : metric.fmt(v))} />}
                cursor={barCursor(isDark)}
              />
              <Bar dataKey="valor" fill={isDark ? "#709DF6" : "#1E5AE2"} radius={[10, 10, 4, 4]} maxBarSize={72} animationDuration={800}>
                <LabelList
                  dataKey="valor"
                  position="top"
                  offset={8}
                  fontSize={11}
                  fill={isDark ? "#C7D2FE" : "#334155"}
                  formatter={(v) => (isAdvisor ? `${Number(v)}%` : metric.fmt(Number(v)))}
                />
              </Bar>
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
                  <div><h3 className="font-semibold text-ink">{entry.position === 1 ? "👑 " : ""}{item.userName}</h3><p className="text-sm text-muted">#{entry.position}{showValue ? ` · ${isAdvisor ? money(item.sales) : valueLabel}` : ""}</p></div>
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
  if (receipts.length === 0) return <Card className="p-5"><p className="font-semibold text-ink">Sin recibos</p><p className="mt-2 text-sm text-muted">Aquí aparecerá un recibo de comisión por cada mes con datos.</p></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {receipts.map((month) => (
        <Card key={month.start} className="h-fit p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Receipt className="text-accent" size={18} /><h2 className="text-lg font-semibold capitalize text-ink">{month.label}</h2></div>
            <Badge tone={month.isCurrent ? "warn" : "default"}>{month.isCurrent ? "En curso" : "Cerrado"}</Badge>
          </div>
          <ReceiptBody line={month.main} highlight />
          {isManager && month.team.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-caption font-medium text-muted">Por asesor</p>
              <div className="space-y-2.5">
                {month.team.map((line) => (
                  <div key={line.name} className="rounded-2xl bg-panel p-3">
                    <div className="mb-1.5 flex items-center gap-2.5"><ProfileAvatar name={line.name} photoUrl={line.photoUrl} size="sm" /><p className="min-w-0 truncate font-semibold text-ink">{line.name}</p></div>
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
      <div className={cn("mt-2.5 flex items-center justify-between rounded-2xl px-3 py-2.5", highlight ? "bg-accent/10 ring-1 ring-accent/30" : "bg-panel")}>
        <span className="text-sm font-semibold text-muted">Comisión</span>
        <span className="text-lg font-semibold text-ink">{money(line.commission)}</span>
      </div>
    </>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between"><span className="text-muted">{label}</span><span className="font-semibold text-ink">{value}</span></div>;
}

function TargetSheet({ targets, period, onClose, onSave }: { targets: KpiTarget[]; period: "SEMANA" | "MES"; onClose: () => void; onSave: (saved: KpiTarget[]) => void }) {
  const getInitial = (metric: string) => targets.find((t) => t.metric === metric)?.value.toString() ?? "";
  const [form, setForm] = useState<Record<string, string>>({
    upt: getInitial("upt"), aur: getInitial("aur"), ept: getInitial("ept"), conversion: getInitial("conversion"), achievement: getInitial("achievement"), whatsapp: getInitial("whatsapp"),
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

  // El PPTO de WhatsApp alimenta el reporte de cierre semanal (sección WHATSAPP).
  const editableMetrics = period === "SEMANA"
    ? (["upt", "aur", "ept", "conversion", "achievement", "whatsapp", "ticketElectronicoTienda", "ticketElectronicoAsesor"] as const)
    : (["upt", "aur", "ept", "conversion", "achievement", "ticketElectronicoTienda", "ticketElectronicoAsesor"] as const);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-void">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Metas KPI — {period === "SEMANA" ? "Semana" : "Mes"}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-panel text-ink dark:bg-panel"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {editableMetrics.map((metric) => {
            const config = METRIC_CONFIG[metric];
            return (
              <div key={metric}>
                <label className="text-caption font-medium text-muted">{config?.targetLabel}</label>
                <input type="number" min="0" step="0.01" value={form[metric]} onChange={(e) => setForm((prev) => ({ ...prev, [metric]: e.target.value }))} placeholder={metric === "upt" ? "Ej: 1.5" : metric === "conversion" ? "Ej: 25" : "Ej: 50000"} className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-panel px-4 text-sm font-bold text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 dark:bg-panel" />
              </div>
            );
          })}
        </div>
        {status ? <p className={cn("mt-3 text-sm font-semibold", status.includes("guardadas") ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>{status}</p> : null}
        <button type="button" onClick={() => void handleSave()} disabled={saving} className="mt-4 min-h-11 w-full rounded-xl bg-accent text-ui font-semibold text-on-accent transition-opacity disabled:opacity-60">{saving ? "Guardando…" : "Guardar metas"}</button>
      </motion.div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="px-2"><p className="text-caption font-medium text-muted">{label}</p><p className="mt-1 font-semibold text-ink">{value}</p></div>; }
