import type { KpiPeriod } from "@/lib/kpi-period";
import { parsePeriodDate } from "@/lib/kpi-period";
import type { KpiReportItem } from "@/lib/kpi-report";
import { kpiPeriodMeta } from "@/lib/services/kpi-period-meta";
import { getKpiReport, type KpiReport } from "@/lib/services/kpi-service";
import type { Session } from "@/lib/session-token";

// Comparación entre dos períodos RETAIL (semana vs semana, mes vs mes). Compone
// dos reportes de KPI ya calculados; el modelo no calcula nada.
export type ComparePeriodsParams = {
  period: KpiPeriod;
  currentDate: Date;
  // Opcional: si no se indica, se resuelve el periodo RETAIL inmediatamente
  // anterior (semana/mes RDV), NO 7/30 días de calendario.
  previousDate?: Date;
};

function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function scopeOf(report: KpiReport, manager: boolean): KpiReportItem | null {
  return manager ? report.store : report.own;
}

// Fecha del periodo retail inmediatamente anterior al del reporte actual,
// tomada de la lista de periodos disponibles (availableWeeks / retailMonths).
function previousRetailDate(report: KpiReport): Date | null {
  if (report.period === "week") {
    const weeks = report.availableWeeks;
    const index = weeks.findIndex((week) => week.weekStart === report.startDate);
    const prev = index > 0 ? weeks[index - 1] : null;
    return prev ? parsePeriodDate(prev.weekStart) : null;
  }
  const months = report.availableRetailMonths;
  const index = months.findIndex((month) => month.start === report.startDate);
  const prev = index > 0 ? months[index - 1] : null;
  return prev ? parsePeriodDate(prev.start) : null;
}

export async function comparePeriods(session: Session, { period, currentDate, previousDate }: ComparePeriodsParams) {
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const current = await getKpiReport(session, { period, selectedDate: currentDate });

  const resolvedPrevDate = previousDate ?? previousRetailDate(current);
  const previous = resolvedPrevDate ? await getKpiReport(session, { period, selectedDate: resolvedPrevDate }) : null;

  const currentScope = scopeOf(current, manager);
  const previousScope = previous ? scopeOf(previous, manager) : null;
  const currentSales = currentScope?.sales ?? 0;
  const previousSales = previousScope?.sales ?? 0;
  const currentGoal = currentScope?.goal ?? 0;
  const previousGoal = previousScope?.goal ?? 0;

  return {
    period,
    scope: manager ? "store" : "own",
    calendarNote: "Comparación entre periodos RETAIL RDV (no meses naturales). El periodo anterior es la semana/mes RDV inmediatamente previo.",
    current: {
      ...kpiPeriodMeta(current),
      sales: currentSales,
      goal: currentGoal,
      achievement: currentScope?.achievement ?? 0
    },
    previous: previous
      ? {
          ...kpiPeriodMeta(previous),
          sales: previousSales,
          goal: previousGoal,
          achievement: previousScope?.achievement ?? 0
        }
      : null,
    salesDeltaPct: previous ? deltaPct(currentSales, previousSales) : null,
    goalDeltaPct: previous ? deltaPct(currentGoal, previousGoal) : null,
    achievementDelta: previous ? Math.round(((currentScope?.achievement ?? 0) - (previousScope?.achievement ?? 0)) * 10) / 10 : null
  };
}
