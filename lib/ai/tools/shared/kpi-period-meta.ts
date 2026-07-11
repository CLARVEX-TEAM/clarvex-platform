import type { KpiReport } from "@/lib/services/kpi-service";

type ReportPeriod = Pick<KpiReport, "period" | "startDate" | "endDate" | "weekNumber" | "retailMonthLabel">;

/** Metadatos de periodo retail para respuestas del Copilot (misma lógica que /api/kpis). */
export function kpiPeriodMeta(report: ReportPeriod) {
  const isWeek = report.period === "week";
  const periodLabel = isWeek
    ? report.weekNumber
      ? `Semana retail ${report.weekNumber} (${report.startDate} – ${report.endDate})`
      : `Semana retail (${report.startDate} – ${report.endDate})`
    : report.retailMonthLabel
      ? `Mes retail ${report.retailMonthLabel} (${report.startDate} – ${report.endDate})`
      : `Mes retail (${report.startDate} – ${report.endDate})`;

  return {
    period: report.period,
    periodLabel,
    startDate: report.startDate,
    endDate: report.endDate,
    weekNumber: report.weekNumber,
    retailMonthLabel: report.retailMonthLabel,
    calendarNote:
      "Periodos RETAIL del RDV (no calendario gregoriano). Semana = semanas RDV; Mes = mes retail (puede abarcar días de dos meses naturales).",
    dataSource: "Fuente: getKpiReport — mismos números que la pestaña KPIs y /api/kpis."
  };
}

export function kpiPerformanceFields(kpi: {
  sales: number;
  goal: number;
  achievement: number;
  transactions: number;
  pieces: number;
  upt: number | null;
  conversion: number | null;
  traffic?: number | null;
}) {
  const remainingToGoal = Math.round(Math.max(kpi.goal - kpi.sales, 0) * 100) / 100;
  const surpassedBy = Math.round(Math.max(kpi.sales - kpi.goal, 0) * 100) / 100;
  return {
    sales: kpi.sales,
    goal: kpi.goal,
    achievement: kpi.achievement,
    remainingToGoal,
    surpassedBy,
    atOrAboveGoal: kpi.sales >= kpi.goal,
    transactions: kpi.transactions,
    pieces: kpi.pieces,
    upt: kpi.upt,
    conversion: kpi.conversion,
    traffic: kpi.traffic ?? null
  };
}
