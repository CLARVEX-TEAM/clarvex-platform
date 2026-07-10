import type { KpiPeriod } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import { getKpiReport } from "@/lib/services/kpi-service";
import type { Session } from "@/lib/session-token";

// Comparación entre dos períodos (semana vs semana, mes vs mes). Compone dos
// reportes de KPI ya calculados; el modelo no calcula nada.
export type ComparePeriodsParams = {
  period: KpiPeriod;
  currentDate: Date;
  previousDate: Date;
};

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function scopeOf(report: Awaited<ReturnType<typeof getKpiReport>>, manager: boolean): KpiReportItem | null {
  return manager ? report.store : report.own;
}

export async function comparePeriods(session: Session, { period, currentDate, previousDate }: ComparePeriodsParams) {
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const [current, previous] = await Promise.all([
    getKpiReport(session, { period, selectedDate: currentDate }),
    getKpiReport(session, { period, selectedDate: previousDate })
  ]);

  const currentScope = scopeOf(current, manager);
  const previousScope = scopeOf(previous, manager);
  const currentSales = currentScope?.sales ?? 0;
  const previousSales = previousScope?.sales ?? 0;
  const currentGoal = currentScope?.goal ?? 0;
  const previousGoal = previousScope?.goal ?? 0;

  return {
    period,
    scope: manager ? "store" : "own",
    current: {
      label: current.retailMonthLabel ?? `Semana ${current.weekNumber ?? "?"}`,
      startDate: current.startDate,
      endDate: current.endDate,
      sales: currentSales,
      goal: currentGoal,
      achievement: currentScope?.achievement ?? 0
    },
    previous: {
      label: previous.retailMonthLabel ?? `Semana ${previous.weekNumber ?? "?"}`,
      startDate: previous.startDate,
      endDate: previous.endDate,
      sales: previousSales,
      goal: previousGoal,
      achievement: previousScope?.achievement ?? 0
    },
    salesDeltaPct: deltaPct(currentSales, previousSales),
    goalDeltaPct: deltaPct(currentGoal, previousGoal),
    achievementDelta: Math.round(((currentScope?.achievement ?? 0) - (previousScope?.achievement ?? 0)) * 10) / 10
  };
}
