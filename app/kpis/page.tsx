"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { barCursor, ChartTooltip, lineCursor, shortName } from "@/components/ChartTooltip";
import { Calculator, ChevronDown, Download, Receipt, Settings2, ShoppingBag, Sparkles, Target, TrendingUp, Trophy, UsersRound, X } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { computeNextBracketGap, formatCommissionLevel, resolveCommissionMinimum } from "@/lib/commission";
import { money } from "@/lib/format";
import type { KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import type { CommissionRule, Role, User } from "@/lib/types";
import { paceLabel, paceStatus, periodElapsed } from "@/lib/progress-pace";
import { KPI_TABS as tabs, metricAchievement, metricStatus, metricStatusText, isCeiling, METRIC_ACCENT, METRIC_CONFIG, formatWeeksElapsed, localDateKey, type KpiTab as Tab, type KpiTarget, type MonthProjection, type MonthSalesProjection, type ReceiptLine, type ReceiptMonth } from "@/lib/kpi-view";
import { ElectronicTicketsPanel } from "@/components/ElectronicTicketsPanel";
import { targetValue } from "@/lib/electronic-tickets";
import { useKpiDerived, useKpiReceipts, useKpiReport, useKpiTargets } from "@/lib/use-kpis";
import { achievementTone, AppFrame, AppHeader, Badge, Card, EmptyState, ProfileAvatar, ProgressBar, ProgressRing, Skeleton, StatCard } from "@/components/ui";
import { TabsLinea } from "@/components/ui/TabsLinea";
import { AppSelect } from "@/components/forms";
import { KpiHistoryView } from "@/components/KpiHistory";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useTheme } from "@/components/ThemeProvider";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/animate-ui/SegmentedTabs";
import { cn } from "@/lib/utils";

// Fuera del componente: si se declarara dentro, sería un array nuevo en cada
// render y la pastilla del selector volvería a montar en vez de deslizarse.
const PERIOD_TABS: ReadonlyArray<SegmentedTabOption<KpiPeriod>> = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" }
];

export default function KpisPage() {
  const { session } = useSession();
  const [period, setPeriod] = useState<KpiPeriod>("week");
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  // Dirección del deslizamiento al cambiar de período: mes entra desde la derecha (+1),
  // semana desde la izquierda (-1). En 0 se usa el fade vertical de siempre (tabs/fechas).
  const [slideDir, setSlideDir] = useState(0);
  const [simulatedSales, setSimulatedSales] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
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

  // Tienda con los KPIs apagados: se llega igual por un enlace de notificación
  // o por un marcador, así que la puerta se cierra también aquí. Enseñar ceros
  // sería peor que no enseñar nada: se leen como «vendimos cero».
  if (session && session.kpisEnabled === false) {
    return (
      <>
        <AppHeader title="KPIs" subtitle="Temporalmente no disponibles." backHref={isAdvisor ? "/advisor" : "/manager"} />
        <AppFrame>
          <EmptyState
            icon={Settings2}
            title="KPIs en pausa"
            description="Estamos adaptando la app al esquema nuevo de tu marca. En cuanto el RDV esté conectado, tus indicadores vuelven a aparecer aquí."
          />
        </AppFrame>
      </>
    );
  }

  return (
    <>
      <AppHeader title="KPIs" subtitle={isAdvisor ? "Tus indicadores por periodo." : "Venta, metas y ranking del equipo."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <PullToRefresh onRefresh={() => { setRefreshTick((t) => t + 1); return new Promise((r) => setTimeout(r, 700)); }}>
      <AppFrame>
        <PeriodSelector period={period} setPeriod={(next) => { if (next !== period) { setSlideDir(next === "month" ? 1 : -1); setPeriod(next); } }} selectedDate={selectedDate} setSelectedDate={(date) => { setSlideDir(0); setSelectedDate(date); }} availableWeeks={report?.availableWeeks ?? []} availableRetailMonths={report?.availableRetailMonths ?? []} />

        {isAdvisor && report ? <Card className="mb-3 p-3"><p className="text-sm font-semibold text-ink">{report.workedDays ? "Calculado sobre tus dias laborados" : "Sin dias laborados en este periodo"}</p><p className="mt-1 text-xs font-semibold text-muted">Dias laborados: {report.workedDays ?? 0}</p></Card> : null}

        {/*
          ⚠️ Eran dos botones del ancho ENTERO, del mismo peso que el contenido.
          Exportar y pedir el reporte de IA son cosas que se hacen una vez al
          cierre; los numeros se miran todos los dias. Bajan a chips y se van al
          final del renglon, sin dejar de estar a un toque.

          ⚠️ Y el comentario va AQUI, no dentro del parentesis del ternario:
          ahi dentro se espera una EXPRESION, y un comentario de JSX no lo es.
          Rompe el archivo entero con un error que ademas senala otra linea.
        */}
        {isManager && report ? (
          <div className="mb-3 flex justify-end gap-2">
            <a
              href={`/api/reports/kpis?start=${report.startDate}&end=${report.endDate}&period=${period}&label=${encodeURIComponent(rangeLabel)}${report.weekNumber ? `&week=${report.weekNumber}` : ""}`}
              className="tappable flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-muted transition hover:border-volt/40 hover:text-ink"
            >
              <Download size={14} /> Excel
            </a>
            <button
              onClick={() => void fetchIaReport()}
              disabled={loadingIaReport}
              className="tappable flex min-h-9 items-center gap-1.5 rounded-full border border-volt/35 px-3 text-xs font-semibold text-volt transition hover:bg-volt/6 disabled:opacity-50"
            >
              <Sparkles size={14} />
              {loadingIaReport ? "Generando..." : "Reporte IA"}
            </button>
          </div>
        ) : null}

        {/*
          ⚠️ Pestanias de SUBRAYADO, no piladoras -- y sin piladora deslizante.
          Eran seis en 412 px, asi que la tira se desplaza siempre; una piladora
          cortada por el borde parece rota (en el telefono la ultima salia como
          «Hi…»), mientras que una palabra cortada se lee como «hay mas a la
          derecha». Y sobre todo: dejan de ser identicas al Semana/Mes de
          arriba, que hace otra cosa.
        */}
        <TabsLinea
          ariaLabel="Vista de KPIs"
          className="mb-3"
          value={activeTab}
          onChange={(id) => { setSlideDir(0); setActiveTab(id); }}
          options={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
        />

        {error ? <Card className="mb-3 bg-orchid/10 text-sm font-semibold text-orchid">{error}</Card> : null}
        {loading ? <div className="space-y-3"><Skeleton className="h-32 rounded-[28px]" /><div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[28px]" />)}</div></div> : activeKpi ? (
          <AnimatePresence mode="wait">
            <motion.div key={`${activeTab}-${period}-${selectedDate}`} initial={{ opacity: 0, x: slideDir * 30, y: slideDir === 0 ? 8 : 0 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={{ opacity: 0, x: slideDir * -22 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
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
              {activeTab === "ventas" ? <VentasView activeKpi={activeKpi} chartData={chartData} progress={progress} periodLabel={periodLabel} /> : null}
              {activeTab === "comision" ? <ComisionView activeKpi={commissionKpi ?? activeKpi} rules={report?.commissionRules ?? []} simulatedSales={simulatedSales} setSimulatedSales={setSimulatedSales} activeRule={activeRule} appliedPercent={appliedPercent} simulatedCommission={simulatedCommission} simulatedAchievement={simulatedAchievement} commissionRole={commissionRole} periodLabel={periodLabel} projection={monthProjection} hasMinimum={hasCommissionMinimum} /> : null}
              {activeTab === "ranking" ? <RankingView ranking={report?.team ?? []} periodLabel={periodLabel} isAdvisor={isAdvisor} currentUserId={report?.currentUserId} /> : null}
              {activeTab === "historico" ? <KpiHistoryView /> : null}
              {activeTab === "recibo" ? <ReciboView receipts={receipts} loading={receiptsLoading} isManager={isManager} /> : null}
            </motion.div>
          </AnimatePresence>
        ) : <Card className="text-sm font-semibold text-muted">No hay KPIs dentro de {rangeLabel}.</Card>}
      </AppFrame>
      </PullToRefresh>
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
        {showIaReportModal && iaReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-lg rounded-t-[32px] bg-card border border-line p-6 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="text-volt" size={20} />
                  <h3 className="text-sm font-semibold text-ink">{iaReport.title}</h3>
                </div>
                <button
                  onClick={() => setShowIaReportModal(false)}
                  className="rounded-full bg-white/5 p-1.5 text-muted hover:text-ink transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs text-muted leading-relaxed">
                <div>
                  <h4 className="font-bold text-volt uppercase tracking-wider text-[10px]">Resumen Ejecutivo</h4>
                  <p className="mt-1 bg-white/2 border border-line rounded-xl p-3 text-muted italic">{iaReport.executiveSummary}</p>
                </div>

                <div>
                  <h4 className="font-bold text-ink uppercase tracking-wider text-[10px]">Análisis de Desempeño</h4>
                  <p className="mt-1">{iaReport.performanceAnalysis}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-mint/5 border border-mint/30 p-3">
                    <span className="font-bold text-mint">Fortalezas:</span>
                    <ul className="list-disc list-inside mt-1.5 space-y-1 text-muted text-[11px]">
                      {iaReport.strengths.map((s: string, idx: number) => <li key={idx}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-orchid/5 border border-orchid/30 p-3">
                    <span className="font-bold text-orchid">Oportunidades:</span>
                    <ul className="list-disc list-inside mt-1.5 space-y-1 text-muted text-[11px]">
                      {iaReport.weaknesses.map((w: string, idx: number) => <li key={idx}>{w}</li>)}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl bg-volt/5 border border-volt/30 p-3.5 space-y-1.5">
                  <span className="font-bold text-volt">Recomendaciones Estratégicas:</span>
                  <ul className="list-decimal list-inside space-y-1">
                    {iaReport.strategicRecommendations.map((r: string, idx: number) => <li key={idx}>{r}</li>)}
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * «17 ago - 23 ago» para el pie de cada opcion del periodo.
 *
 * ⚠️ Las fechas se parten a mano y se construyen en UTC. Un `new Date("2026-08-17")`
 * se interpreta como medianoche UTC y se PINTA en la zona del telefono, que en
 * Monterrey va seis horas por detras: el 17 se enseñaria como 16. Es el mismo
 * corrimiento de un dia que ya costo caro en el margen DTO.
 */
function rangoCorto(inicio: string, fin: string) {
  const comoTexto = (iso: string) => {
    const [anio, mes, dia] = iso.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, dia ?? 1))
      .toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  return `${comoTexto(inicio)} - ${comoTexto(fin)}`;
}

function PeriodSelector({ period, setPeriod, selectedDate, setSelectedDate, availableWeeks, availableRetailMonths }: { period: KpiPeriod; setPeriod: (period: KpiPeriod) => void; selectedDate: string; setSelectedDate: (date: string) => void; availableWeeks: Array<{ weekNumber: number; weekStart: string; weekEnd: string }>; availableRetailMonths: Array<{ label: string; start: string; end: string }> }) {
  // El mes que contiene la fecha elegida; si ninguno la contiene, el ultimo.
  const mesActivo = availableRetailMonths.find((month) => selectedDate >= month.start && selectedDate <= month.end)?.start
    ?? availableRetailMonths.at(-1)?.start
    ?? selectedDate;
  const opcionesPeriodo = period === "week"
    ? availableWeeks.map((week) => ({
        value: week.weekStart,
        label: `Semana ${week.weekNumber}`,
        description: rangoCorto(week.weekStart, week.weekEnd)
      }))
    : availableRetailMonths.map((month) => ({
        value: month.start,
        label: month.label,
        description: rangoCorto(month.start, month.end)
      }));
  const elegido = opcionesPeriodo.find((o) => o.value === (period === "week" ? selectedDate : mesActivo));

  return (
    <Card className="mb-3 p-3">
      {/*
        ⚠️ El periodo es el TITULO, y el titulo es el control. Antes habia un
        campo aparte rotulado «PERIODO» con el mes dentro, debajo del
        Semana/Mes: dos bloques para decir una sola cosa. Ahora se toca el
        propio «Agosto 2026» y se abre la misma hoja.
      */}
      <div className="flex items-start justify-between gap-3">
        <AppSelect
          label="Periodo"
          value={period === "week" ? selectedDate : mesActivo}
          onChange={setSelectedDate}
          options={opcionesPeriodo}
          renderTrigger={({ abrir }) => (
            <button
              type="button"
              onClick={abrir}
              className="tappable min-w-0 text-left"
              aria-label="Cambiar periodo"
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[19px] font-semibold tracking-[-0.02em] text-ink">
                  {elegido?.label ?? "Periodo"}
                </span>
                <ChevronDown size={17} className="shrink-0 text-muted" />
              </span>
              {/* El rango de fechas se conserva: es lo que de verdad dice
                  cuanto abarca «Semana 34», que por si solo no dice nada. */}
              <span className="mt-0.5 block truncate text-xs text-muted">
                {elegido?.description ?? ""}
              </span>
            </button>
          )}
        />
        {/* Compacto y a la derecha: cambia la UNIDAD, no la vista. */}
        <SegmentedTabs
          ariaLabel="Unidad del periodo"
          value={period}
          onChange={setPeriod}
          options={PERIOD_TABS}
          className="shrink-0"
          itemClassName="px-3"
        />
      </div>
    </Card>
  );
}


function ResumenView({ activeKpi, team, progress, periodLabel, hasDiscountSource, latestDiscountWeek, targets, isManager, onOpenTargets, salesProjection , periodStart, periodEnd }: { activeKpi: KpiReportItem; team: KpiReportItem[]; progress: number; periodLabel: string; hasDiscountSource: boolean; latestDiscountWeek: { weekNumber: number; margin: number | null } | null; targets: KpiTarget[]; isManager: boolean; onOpenTargets: () => void; salesProjection?: MonthSalesProjection | null ; periodStart?: string; periodEnd?: string }) {
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

  // Dónde deberías ir HOY según el periodo transcurrido. El color del
  // cumplimiento sale de esto y no del 100%: el día 2 de un mes de cuatro
  // semanas, un 33% va POR DELANTE aunque antes se pintara en rojo.
  const pace = periodStart && periodEnd ? periodElapsed(periodStart, periodEnd) : null;
  const getTarget = (metric: string) => targets.find((t) => t.metric === metric)?.value ?? null;

  // Delegado a lib/kpi-view: el Margen DTO es un TECHO y su semáforo va al revés.
  const semaphore = (value: number | null, metric: string) => metricStatus(value, getTarget(metric), metric);

  const spark = (extractor: (m: KpiReportItem) => number | null) =>
    team.map((m, i) => ({ i, v: extractor(m) ?? 0 }));

  // Color del cumplimiento CONTRA EL RITMO, no contra el 100%: el día 2 de un
  // mes de cuatro semanas, un 33% va por delante de lo esperado (~25%).
  const goalStatus = paceStatus(progress, pace);
  const goalToneText = goalStatus === "cumplida" || goalStatus === "adelante"
    ? "text-success"
    : goalStatus === "en-ritmo" ? "text-ink" : "text-orchid";

  return (
    <>
      <Card className="premium-hero mb-3 px-4 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Cumplimiento {periodLabel}</p>
            <h2 className={cn("mt-1 text-[2.25rem] font-semibold leading-none", goalToneText)}>{progress}%</h2>
            <p className="mt-1 text-xs text-muted">{money(activeKpi.sales)} de {money(activeKpi.goal)}</p>
            {activeKpi.goal > 0 ? (
              <p className={cn("mt-0.5 text-xs font-semibold", activeKpi.sales >= activeKpi.goal ? "text-success" : "text-volt")}>
                {activeKpi.sales >= activeKpi.goal ? `Meta superada por ${money(activeKpi.sales - activeKpi.goal)}` : `Faltan ${money(activeKpi.goal - activeKpi.sales)} para la meta ${periodLabel}`}
              </p>
            ) : null}
          </div>
          {/*
            * Las metas se capturan en Retool, dentro de Cuota Justa.
            *
            * Aqui se LEEN —son las que pintan el semaforo— pero ya no se
            * editan: dos puertas al mismo dato acaban discrepando y nadie sabe
            * cual mando, que es lo que paso con el importador pegado de la
            * Cuota Justa.
            */}
          <div className="flex shrink-0 items-center gap-2" />
        </div>
        <ProgressBar value={progress} pace={pace} />
        {pace !== null ? (
          <p className="mt-1.5 text-[11px] text-muted">{paceLabel(goalStatus, pace)}</p>
        ) : null}
      </Card>

      {salesProjection ? (
        <Card className="mb-3 border border-mint/30 bg-mint/8 p-3.5 ">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p>
              <h2 className="mt-1 text-[1.9rem] font-semibold leading-none text-ink">{money(salesProjection.projectedSales)}</h2>
              <p className="mt-1.5 text-sm text-muted">{salesProjection.achievement}% de la meta {money(salesProjection.goal)} · al ritmo de las semanas con datos ({formatWeeksElapsed(salesProjection.weeksElapsed)}/{salesProjection.totalWeeks})</p>
            </div>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success/10 text-success"><TrendingUp size={25} /></span>
          </div>
          <div className="mt-2.5"><ProgressBar value={salesProjection.achievement} pace={100} /></div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <MetricCard metric="upt" raw={activeKpi.upt} target={getTarget("upt")}         value={activeKpi.upt === null ? "—" : String(activeKpi.upt)}                                   detail="Unidades por ticket"               sparkData={spark((m) => m.upt)}            trafficLight={semaphore(activeKpi.upt, "upt")} />
        <MetricCard metric="aur" raw={activeKpi.aur} target={getTarget("aur")}         value={activeKpi.aur === null ? "—" : money(activeKpi.aur)}                                    detail="Precio promedio pieza"             sparkData={spark((m) => m.aur)}            trafficLight={semaphore(activeKpi.aur, "aur")} />
        <MetricCard metric="ept" raw={activeKpi.ept} target={getTarget("ept")}         value={activeKpi.ept === null ? "—" : money(activeKpi.ept)}                                    detail="Venta por transacción"             sparkData={spark((m) => m.ept)}            trafficLight={semaphore(activeKpi.ept, "ept")} />
        <MetricCard metric="conversion" raw={activeKpi.conversion} target={getTarget("conversion")}  value={activeKpi.conversion === null ? "—" : `${activeKpi.conversion}%`}                       detail={activeKpi.conversion === null ? "Sin tráfico" : "Tickets / Tráfico"}  sparkData={spark((m) => m.conversion)}     trafficLight={semaphore(activeKpi.conversion, "conversion")} />
        <MetricCard metric="margen" raw={activeKpi.discountMargin} target={getTarget("margen")}      value={discountValue}                                                                          detail={discountDetail}                    sparkData={spark((m) => m.discountMargin)} trafficLight={semaphore(activeKpi.discountMargin, "margen")} />
        <MetricCard metric="achievement" raw={progress} target={getTarget("achievement")} value={`${progress}%`}                                                                        detail={`Objetivo ${periodLabel}`}         sparkData={team.map((m, i) => ({ i, v: m.achievement }))} trafficLight={semaphore(progress, "achievement")} />
      </div>
    </>
  );
}

function MetricCard({ metric, value, raw, target, detail, sparkData, trafficLight }: { metric: string; value: string; raw?: number | null; target?: number | null; detail: string; sparkData: Array<{ i: number; v: number }>; trafficLight: "green" | "yellow" | "red" | "none" }) {
  const config = METRIC_CONFIG[metric];
  const accent = METRIC_ACCENT[metric];
  if (!config || !accent) return null;
  const { label, Icon } = config;

  /*
   * ⚠️ El color por metrica se IGNORA aqui a proposito.
   *
   * `METRIC_ACCENT` le da a cada una un tono distinto --UPT azul, AUR cian,
   * EPT morado, conversion ambar, margen rojo, cumplimiento verde-- y ninguno
   * significa nada: UPT no es azul por un motivo. Seis tarjetas, seis colores,
   * y el unico color que SI dice algo --el punto del semaforo y el porcentaje
   * de alcance-- se perdia entre ellos.
   *
   * ⚠️ Y se anula AQUI, no en `METRIC_ACCENT`, porque ese mapa lo comparte
   * `app/escritorio/kpis`, que es la web y no debe cambiar de aspecto.
   *
   * Se usa `accent`/`bg-accent` y no `volt` por la razon que explica el propio
   * mapa: dentro del escritorio resuelve al acento aclarado, y fuera cae en
   * #2563EB, que es el mismo azul.
   */
  const chipAzul = "bg-accent/10 text-accent";
  const chispaAzul = "#2563EB";

  // Semáforo vs meta configurada: única señal de color de estado en la tarjeta.
  const dotClass = {
    green: "bg-success",
    yellow: "bg-ember",
    red: "bg-orchid",
    none: "bg-line",
  }[trafficLight];

  const achievement = metricAchievement(raw ?? null, target ?? null);
  const toneClass = { green: "text-success", yellow: "text-ember", red: "text-orchid", none: "text-muted" }[trafficLight];

  return (
    <div className="solid-card relative min-h-[118px] overflow-hidden rounded-[28px] p-3.5">
      <span className={cn("absolute right-3 top-3 size-2.5 rounded-full", dotClass)} />

      <span className={cn("inline-grid size-8 place-items-center rounded-[14px]", chipAzul)}>
        <Icon size={15} />
      </span>

      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <p className="text-[1.36rem] font-semibold leading-none tracking-[-0.03em] text-ink">{value}</p>
        {/* El alcance, que es lo que se pregunta: «¿voy bien?». */}
        {achievement !== null ? (
          <span className={cn("text-[13px] font-bold tabular-nums", toneClass)}>{achievement}%</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] leading-4 text-muted">
        {target !== null && target !== undefined
          ? `${isCeiling(metric) ? "Límite" : "Meta"} ${target} · ${metricStatusText(trafficLight, metric)}`
          : detail}
      </p>

      {sparkData.length > 2 ? (
        <div className="pointer-events-none absolute bottom-0 right-0 h-10 w-20 opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <Line type="monotone" dataKey="v" stroke={chispaAzul} strokeWidth={1.5} dot={false} animationDuration={600} />
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
    whatsapp: getInitial("whatsapp"),
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

  // El PPTO de Pasillo Infinito alimenta el reporte de cierre semanal (sección WHATSAPP).
  const editableMetrics = period === "SEMANA"
    ? (["upt", "aur", "ept", "conversion", "achievement", "whatsapp", "ticketElectronicoTienda", "ticketElectronicoAsesor"] as const)
    : (["upt", "aur", "ept", "conversion", "achievement", "ticketElectronicoTienda", "ticketElectronicoAsesor"] as const);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 backdrop-blur-xs">
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 380 }}
        className="w-full max-w-lg rounded-t-3xl bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Metas KPI — {period === "SEMANA" ? "Semana" : "Mes"}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-panel dark:bg-line text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3">
          {editableMetrics.map((metric) => {
            const config = METRIC_CONFIG[metric];
            return (
              <div key={metric}>
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted">{config?.targetLabel}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[metric]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [metric]: e.target.value }))}
                  placeholder={metric === "upt" ? "Ej: 1.5" : metric === "conversion" ? "Ej: 25" : "Ej: 50000"}
                  className="mt-1 min-h-11 w-full rounded-2xl border border-line bg-panel px-4 text-sm font-bold text-ink outline-hidden focus:border-volt focus:ring-4 focus:ring-volt/15"
                />
              </div>
            );
          })}
        </div>
        {status ? (
          <p className={cn("mt-3 text-sm font-semibold", status.includes("guardadas") ? "text-mint" : "text-muted")}>
            {status}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="mt-4 min-h-12 w-full rounded-2xl bg-volt text-sm font-semibold text-white shadow-[0_8px_20px_rgb(37_99_235/0.22)] transition hover:bg-volt/85 active:scale-95 disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar metas"}
        </button>
      </motion.div>
    </div>
  );
}

function VentasView({ activeKpi, chartData, progress, periodLabel }: { activeKpi: KpiReportItem; chartData: Array<{ name: string; venta: number; meta: number }>; progress: number; periodLabel: string }) {
  const { isDark } = useTheme();
  const data = chartData.length ? chartData : [{ name: activeKpi.userName, venta: activeKpi.sales, meta: activeKpi.goal }];
  // La gráfica vive directo sobre la card, en los colores del tema: nada de
  // cajas oscuras hardcodeadas en tema claro.
  const tickFill = isDark ? "#8899BB" : "#64748B";
  const gridStroke = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.07)";
  const dotStroke = isDark ? "#1a2540" : "#FFFFFF";
  return <><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp className="text-volt" size={18} /><h2 className="text-lg font-semibold">Ventas {periodLabel === "semanal" ? "de la semana" : "del mes"}</h2></div><Badge>{progress}%</Badge></div><div className="h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="kpiSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.03} /></linearGradient></defs><XAxis dataKey="name" tick={{ fill: tickFill, fontSize: 9 }} axisLine={false} tickLine={false} /><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><Tooltip content={<ChartTooltip isDark={isDark} format={money} />} cursor={lineCursor(isDark)} /><Area type="monotone" dataKey="venta" stroke="#2563EB" strokeWidth={2.5} fill="url(#kpiSales)" dot={{ r: 4, fill: "#2563EB", stroke: dotStroke, strokeWidth: 1.5 }} activeDot={{ r: 6, fill: "#3B82F6", stroke: dotStroke, strokeWidth: 2 }} animationDuration={800} animationEasing="ease-out" animationBegin={0} /></AreaChart></ResponsiveContainer></div></Card><div className="grid grid-cols-2 gap-3"><StatCard compact label={`Venta ${periodLabel}`} value={money(activeKpi.sales)} detail="Acumulada" progress={progress} icon={<ShoppingBag size={15} />} /><StatCard compact label={`Meta ${periodLabel}`} value={money(activeKpi.goal)} detail="Suma de metas diarias" tone="sky" icon={<Target size={15} />} /><StatCard compact label="Cumplimiento" value={`${progress}%`} detail={`Periodo ${periodLabel}`} tone="purple" progress={progress} icon={<TrendingUp size={15} />} /><StatCard compact label="Transacciones" value={String(activeKpi.transactions)} detail="Tickets acumulados" tone="ember" icon={<Receipt size={15} />} /></div></>;
}

function ComisionView({ activeKpi, rules, simulatedSales, setSimulatedSales, activeRule, appliedPercent, simulatedCommission, simulatedAchievement, commissionRole, periodLabel, projection, hasMinimum }: { activeKpi: KpiReportItem; rules: CommissionRule[]; simulatedSales: string; setSimulatedSales: (value: string) => void; activeRule?: CommissionRule; appliedPercent: number; simulatedCommission: number; simulatedAchievement: number; commissionRole: Role; periodLabel: string; projection?: MonthProjection | null; hasMinimum: boolean }) {
  const missingRuleMessage = !hasMinimum ? "Sin mínimo de comisión sincronizado" : `No existe regla para ${commissionRole} ${Math.round(simulatedAchievement)}%`;
  // "¿Cuánto me falta?" — venta restante para el siguiente bracket de comisión.
  const bracketGap = hasMinimum && activeKpi.sales > 0
    ? computeNextBracketGap({ sales: activeKpi.sales, minimum: resolveCommissionMinimum(activeKpi.commissionMinimum ?? null, activeKpi.goal), rules, role: commissionRole })
    : null;
  return <>{bracketGap ? (
    bracketGap.atTop ? (
      <Card className="mb-3 border border-ember/30 bg-ember/8 p-3.5 ">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-volt/10 text-2xl">🏆</span>
          <div>
            <h2 className="text-lg font-semibold leading-tight text-ink">¡Nivel máximo de comisión!</h2>
            <p className="mt-0.5 text-sm font-semibold text-muted">Ya ganas el {bracketGap.currentPercent}% — mantén el ritmo.</p>
          </div>
        </div>
      </Card>
    ) : (
      <Card className="mb-3 border border-volt/25 bg-volt/8 p-3.5 ">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Te faltan</p>
            <h2 className="mt-1 text-[2rem] font-semibold leading-none text-ink">{money(bracketGap.salesNeeded)}</h2>
            <p className="mt-1.5 text-sm text-muted">para el {bracketGap.targetAchievement}% y subir tu comisión de {bracketGap.currentPercent}% a <span className="font-semibold text-volt">{bracketGap.nextPercent}%</span></p>
          </div>
          <span className="grid size-12 place-items-center rounded-2xl bg-volt/10 text-2xl">🎯</span>
        </div>
        {bracketGap.extraCommission > 0 ? <div className="mt-2.5"><Mini label="Comisión extra estimada" value={`+${money(bracketGap.extraCommission)}`} /></div> : null}
      </Card>
    )
  ) : null}{projection ?<Card className="mb-3 border border-mint/30 bg-mint/8 p-3.5 "><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Proyección de cierre de mes</p><h2 className="mt-1 text-[2rem] font-semibold leading-none text-ink">{money(projection.projectedCommission)}</h2><p className="mt-1.5 text-sm text-muted">Al ritmo de tus semanas con datos 💰</p></div><span className="grid size-12 place-items-center rounded-2xl bg-success/10 text-success"><TrendingUp size={25} /></span></div><div className="mt-2.5 grid grid-cols-3 gap-2"><Mini label="Venta proy." value={money(projection.projectedSales)} /><Mini label="Nivel actual" value={projection.levelLabel} /><Mini label="Semanas" value={`${formatWeeksElapsed(projection.weeksElapsed)}/${projection.totalWeeks}`} /></div></Card> : null}<Card className="premium-hero mb-3 p-3.5"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Comision estimada {periodLabel}</p><h2 className="mt-1 text-[2.1rem] font-semibold leading-none text-ink">{hasMinimum ? money(simulatedCommission) : "—"}</h2><p className={`mt-1 text-sm ${activeRule ? "text-muted" : "font-semibold text-orchid"}`}>{activeRule ? `${formatCommissionLevel(activeRule)} por nivel actual` : missingRuleMessage}</p></div><span className="grid size-12 place-items-center rounded-2xl bg-purple/10 text-purple"><Trophy size={25} /></span></div><div className="mt-2.5 grid grid-cols-2 gap-2"><Mini label={activeRule?.payoutType === "FIXED" ? "Importe del nivel" : "Porcentaje"} value={hasMinimum ? formatCommissionLevel(activeRule) : "—"} /><Mini label="Alcance vs mínimo" value={hasMinimum ? `${Math.round(simulatedAchievement)}%` : "—"} /></div></Card><Card className="mb-3 p-3.5"><div className="mb-2.5 flex items-center gap-2"><Calculator className="text-volt" size={18} /><h2 className="text-lg font-semibold">Simulador {periodLabel}</h2></div><input value={simulatedSales} onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={String(Math.round(activeKpi.sales))} aria-label={`Venta simulada ${periodLabel}`} className="min-h-14 w-full rounded-2xl border border-line bg-panel px-4 text-xl font-semibold text-ink outline-hidden focus:border-volt focus:ring-4 focus:ring-volt/15" /></Card><Card className="p-3.5"><div className="mb-2.5 flex items-center justify-between"><h2 className="text-lg font-semibold">Escalera de niveles</h2><Badge>{commissionRole}</Badge></div>{rules.filter((rule) => rule.active && rule.role === commissionRole).map((rule) => <div key={rule.id} className="flex items-center justify-between border-t border-line py-2.5 first:border-0"><div><p className="font-semibold">{rule.minAchievement}% a {rule.maxAchievement ?? "mas"}%</p><p className="text-xs text-muted">Regla por cumplimiento</p></div><Badge tone={rule.id === activeRule?.id ? "success" : "default"}>{formatCommissionLevel(rule)}</Badge></div>)}</Card></>;
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
      <div className="mb-2.5 flex items-center justify-between"><div className="flex items-center gap-2"><UsersRound className="text-volt" size={18} /><h2 className="text-lg font-semibold">Ranking {periodLabel}</h2></div><Badge>equipo</Badge></div>
      {!isAdvisor ? (
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {RANK_METRICS.map((option) => (
            <button key={option.id} type="button" onClick={() => setMetricId(option.id)} className={cn("min-h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold transition active:scale-95", metricId === option.id ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line hover:text-ink")}>{option.label}</button>
          ))}
        </div>
      ) : null}
      {/* Barras: más altas, con tope de ancho y nombre de pila. Antes eran
          bloques planos apretados con el nombre completo debajo, que en un
          teléfono se cortaba. El valor va ENCIMA de cada barra: con tres o
          cinco personas se lee todo sin tener que tocar nada. */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 6, left: 6, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"} vertical={false} />
            <XAxis
              dataKey="name"
              tickFormatter={shortName}
              tick={{ fill: isDark ? "#8899BB" : "#64748B", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              content={<ChartTooltip isDark={isDark} format={(v) => (isAdvisor ? `${v}%` : metric.fmt(v))} />}
              cursor={barCursor(isDark)}
            />
            <Bar dataKey="valor" fill="#2563EB" radius={[10, 10, 4, 4]} maxBarSize={54} animationDuration={800} animationEasing="ease-out">
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
    <Card className="divide-y divide-line p-3.5">{ranked.length ? ranked.map((entry) => {
      const item = entry.item;
      const showValue = !isAdvisor || item.userId === currentUserId;
      const valueLabel = entry.value === null ? "—" : metric.fmt(entry.value);
      return <div key={item.userId} className="py-3 first:pt-0 last:pb-0"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><ProfileAvatar name={item.userName} photoUrl={item.photoUrl} size="md" /><div><h3 className="font-semibold">{entry.position === 1 ? "👑 " : ""}{item.userName}</h3><p className="text-sm text-muted">#{entry.position}{showValue ? ` · ${isAdvisor ? money(item.sales) : valueLabel}` : ""}</p></div></div>{entry.position === 1 ? <Badge tone="warn">Líder</Badge> : <Badge>{Math.round(item.achievement)}%</Badge>}</div><ProgressBar value={isAdvisor ? item.achievement : Math.round(((entry.value ?? 0) / maxValue) * 100)} /></div>;
    }) : <p className="text-sm font-semibold text-muted">No hay asesores con datos en este periodo.</p>}</Card>
  </>;
}

function ReciboView({ receipts, loading, isManager }: { receipts: ReceiptMonth[] | null; loading: boolean; isManager: boolean }) {
  if (loading || receipts === null) return <Card className="text-sm font-semibold text-muted">Cargando recibos...</Card>;
  if (receipts.length === 0) return <Card><p className="font-semibold">Sin recibos</p><p className="mt-2 text-sm text-muted">Aquí aparecerá un recibo de comisión por cada mes con datos.</p></Card>;
  return (
    <div className="space-y-3">
      {receipts.map((month) => (
        <Card key={month.start} className="p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="text-volt" size={18} />
              <h2 className="text-lg font-semibold capitalize">{month.label}</h2>
            </div>
            <Badge tone={month.isCurrent ? "warn" : "default"}>{month.isCurrent ? "En curso" : "Cerrado"}</Badge>
          </div>
          <ReceiptBody line={month.main} highlight />
          {isManager && month.team.length > 0 ? (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Por asesor</p>
              <div className="space-y-2.5">
                {month.team.map((line) => (
                  <div key={line.name} className="rounded-2xl bg-panel p-3">
                    <div className="mb-1.5 flex items-center gap-2.5">
                      <ProfileAvatar name={line.name} photoUrl={line.photoUrl} size="sm" />
                      <p className="min-w-0 truncate font-semibold text-ink">{line.name}</p>
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
      <div className={cn("mt-2.5 flex items-center justify-between rounded-2xl px-3 py-2.5", highlight ? "bg-volt/10 ring-1 ring-volt/30" : "bg-white/4")}>
        <span className="text-sm font-semibold text-muted">Comisión</span>
        <span className="text-lg font-semibold text-ink">{money(line.commission)}</span>
      </div>
    </>
  );
}

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-muted">{label}</span><span className={cn("font-semibold", strong ? "text-ink" : "text-ink")}>{value}</span></div>;
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="px-2"><p className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p><p className="mt-1 font-semibold text-ink">{value}</p></div>; }
