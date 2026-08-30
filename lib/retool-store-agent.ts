import type { ManagerDashboardMetric } from "@/lib/retool-manager-dashboard";
import { buildManagerDashboardMetric } from "@/lib/retool-manager-dashboard";

const DAY_MS = 86_400_000;

export type StoreAgentRoute = {
  type: "retool";
  path: "/horarios" | "/asistencia" | "/kpis" | "/cuota-justa" | "/descuentos" | "/kardex" | "/ticket-electronico";
} | {
  type: "clarvex";
  path: "/pendientes" | "/escritorio/pendientes";
};

export type StoreAgentSeverity = "critical" | "warning" | "info";

export type StoreAgentAction = {
  id: string;
  severity: StoreAgentSeverity;
  title: string;
  detail: string;
  source: "KPIS" | "ASISTENCIA" | "PENDIENTES" | "KARDEX" | "CUOTA_JUSTA" | "HORARIOS";
  route: StoreAgentRoute;
  label: string;
  count?: number;
  status?: string;
  period?: { start: string; end: string; label: string };
};

export type StoreAgentPeriodKey = "today" | "wtd" | "mtd" | "lastClosedMonth";

export type StoreAgentPeriod = {
  key: StoreAgentPeriodKey;
  title: string;
  label: string;
  start: string;
  end: string;
  metric: ManagerDashboardMetric;
  rowCount: number;
  comparison?: {
    label: string;
    start: string;
    end: string;
    baseline: ManagerDashboardMetric;
    salesDeltaPct: number | null;
    achievementDelta: number | null;
    transactionsDeltaPct: number | null;
    piecesDeltaPct: number | null;
  };
};

export type StoreAgentBrief = {
  mode: "store-agent-operational-v1";
  generatedAt: string;
  primaryKpi: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
  weekContext: StoreAgentPeriod;
  attention: StoreAgentAction[];
  quickActions: Array<{
    id: string;
    label: string;
    detail: string;
    route: StoreAgentRoute;
  }>;
  insights: string[];
  dataSources: Array<{
    label: string;
    source: string;
    range: string;
    formula: string;
  }>;
};

export type KpiPeriodRow = {
  date: Date;
  dailySales: { toString(): string } | number | null;
  dailyGoal: { toString(): string } | number | null;
  transactions: number;
  pieces: number;
  traffic: number | null;
};

export type WeeklyPerformanceCloseState = {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  weekNumber: number;
  status: "DRAFT" | "FINALIZED" | string;
  quotaSavedAt: Date | null;
  reportSavedAt: Date | null;
  finalizedAt: Date | null;
};

export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function percentDelta(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return Math.round(((current - baseline) / Math.abs(baseline)) * 10_000) / 100;
}

function number(value: { toString(): string } | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function clampEnd(end: Date, maxEnd: Date): Date {
  return end.getTime() > maxEnd.getTime() ? maxEnd : end;
}

function aggregateRows(rows: KpiPeriodRow[], start: Date, end: Date): { metric: ManagerDashboardMetric; rowCount: number } {
  const trafficByDate = new Map<string, number>();
  let sales = 0;
  let goal = 0;
  let transactions = 0;
  let pieces = 0;
  let rowCount = 0;

  for (const row of rows) {
    const time = row.date.getTime();
    if (time < start.getTime() || time > end.getTime()) continue;
    rowCount += 1;
    sales += number(row.dailySales);
    goal += number(row.dailyGoal);
    transactions += row.transactions;
    pieces += row.pieces;
    if (row.traffic !== null) {
      const key = dateKey(row.date);
      trafficByDate.set(key, Math.max(trafficByDate.get(key) ?? 0, row.traffic));
    }
  }

  const traffic = trafficByDate.size > 0
    ? Array.from(trafficByDate.values()).reduce((total, value) => total + value, 0)
    : null;

  return {
    metric: buildManagerDashboardMetric({ sales, goal, transactions, pieces, traffic }),
    rowCount
  };
}

function buildComparison(label: string, rows: KpiPeriodRow[], start: Date, end: Date, current: ManagerDashboardMetric) {
  const baseline = aggregateRows(rows, start, end).metric;
  return {
    label,
    start: dateKey(start),
    end: dateKey(end),
    baseline,
    salesDeltaPct: percentDelta(current.sales, baseline.sales),
    achievementDelta:
      current.achievement !== null && baseline.achievement !== null
        ? Math.round((current.achievement - baseline.achievement) * 10) / 10
        : null,
    transactionsDeltaPct: percentDelta(current.transactions, baseline.transactions),
    piecesDeltaPct: percentDelta(current.pieces, baseline.pieces)
  };
}

function periodHasSignal(period: StoreAgentPeriod): boolean {
  return period.rowCount > 0 && (
    period.metric.sales > 0 ||
    period.metric.goal > 0 ||
    period.metric.transactions > 0 ||
    period.metric.pieces > 0
  );
}

function periodHasActivity(period: StoreAgentPeriod): boolean {
  return period.rowCount > 0 && (
    period.metric.sales > 0 ||
    period.metric.transactions > 0 ||
    period.metric.pieces > 0
  );
}

export function buildAgentPeriods(input: {
  rows: KpiPeriodRow[];
  today: Date;
  weekStart: Date;
  weekEnd: Date;
  retailMonthStart: Date;
  retailMonthEnd: Date;
  previousWeekStart: Date;
  previousWeekEnd: Date;
  previousMonthStart: Date;
  previousMonthEnd: Date;
  beforePreviousMonthStart: Date;
  beforePreviousMonthEnd: Date;
}): {
  today: StoreAgentPeriod;
  week: StoreAgentPeriod;
  month: StoreAgentPeriod;
  lastClosedMonth: StoreAgentPeriod;
  primary: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
} {
  const elapsedWeekDays = Math.max(0, Math.round((input.weekEnd.getTime() - input.weekStart.getTime()) / DAY_MS));
  const elapsedMonthDays = Math.max(0, Math.round((input.retailMonthEnd.getTime() - input.retailMonthStart.getTime()) / DAY_MS));
  const previousWeekComparableEnd = clampEnd(addDays(input.previousWeekStart, elapsedWeekDays), input.previousWeekEnd);
  const previousMonthComparableEnd = clampEnd(addDays(input.previousMonthStart, elapsedMonthDays), input.previousMonthEnd);

  const todayAgg = aggregateRows(input.rows, input.today, input.today);
  const weekAgg = aggregateRows(input.rows, input.weekStart, input.weekEnd);
  const monthAgg = aggregateRows(input.rows, input.retailMonthStart, input.retailMonthEnd);
  const closedAgg = aggregateRows(input.rows, input.previousMonthStart, input.previousMonthEnd);
  const weekClosed = input.weekEnd.getTime() < input.today.getTime();
  const monthClosed = input.retailMonthEnd.getTime() < input.today.getTime();

  const today: StoreAgentPeriod = {
    key: "today",
    title: "Hoy",
    label: "Fecha operativa",
    start: dateKey(input.today),
    end: dateKey(input.today),
    metric: todayAgg.metric,
    rowCount: todayAgg.rowCount
  };
  const week: StoreAgentPeriod = {
    key: "wtd",
    title: weekClosed ? "Última semana capturada" : "Semana actual",
    label: "Semana",
    start: dateKey(input.weekStart),
    end: dateKey(input.weekEnd),
    metric: weekAgg.metric,
    rowCount: weekAgg.rowCount,
    comparison: buildComparison("Semana anterior comparable", input.rows, input.previousWeekStart, previousWeekComparableEnd, weekAgg.metric)
  };
  const month: StoreAgentPeriod = {
    key: "mtd",
    title: monthClosed ? "Cierre del mes" : "Mes en curso",
    label: monthClosed ? "Mes cerrado" : "Mes retail",
    start: dateKey(input.retailMonthStart),
    end: dateKey(input.retailMonthEnd),
    metric: monthAgg.metric,
    rowCount: monthAgg.rowCount,
    comparison: buildComparison("Mismo periodo del mes anterior", input.rows, input.previousMonthStart, previousMonthComparableEnd, monthAgg.metric)
  };
  const lastClosedMonth: StoreAgentPeriod = {
    key: "lastClosedMonth",
    title: "Cierre del mes",
    label: "Último mes cerrado",
    start: dateKey(input.previousMonthStart),
    end: dateKey(input.previousMonthEnd),
    metric: closedAgg.metric,
    rowCount: closedAgg.rowCount,
    comparison: buildComparison("Mes anterior al cierre", input.rows, input.beforePreviousMonthStart, input.beforePreviousMonthEnd, closedAgg.metric)
  };

  const primary = periodHasActivity(today)
    ? today
    : periodHasSignal(month)
      ? month
      : periodHasSignal(week)
        ? week
        : periodHasSignal(lastClosedMonth)
          ? lastClosedMonth
          : today;
  const monthContext = periodHasSignal(month) ? month : periodHasSignal(lastClosedMonth) ? lastClosedMonth : month;

  return { today, week, month, lastClosedMonth, primary, monthContext };
}

export function buildWeeklyPerformanceActions(closes: WeeklyPerformanceCloseState[]): StoreAgentAction[] {
  return closes.flatMap((close) => {
    const period = {
      start: dateKey(close.weekStart),
      end: dateKey(close.weekEnd),
      label: `Semana ${close.weekNumber}`
    };
    if (!close.quotaSavedAt) {
      return [{
        id: `weekly-quota-${period.start}`,
        severity: "warning" as const,
        title: "Guardar Cuota Justa",
        detail: `${period.label} cerró el ${period.end} y no tiene Cuota Justa guardada.`,
        source: "CUOTA_JUSTA" as const,
        route: { type: "retool" as const, path: "/cuota-justa" as const },
        label: "Abrir Cuota Justa",
        status: close.status,
        period
      }];
    }
    if (!close.reportSavedAt) {
      return [{
        id: `weekly-report-${period.start}`,
        severity: "warning" as const,
        title: "Guardar RDS semanal",
        detail: `${period.label} ya tiene Cuota Justa, pero falta guardar el reporte semanal.`,
        source: "CUOTA_JUSTA" as const,
        route: { type: "retool" as const, path: "/cuota-justa" as const },
        label: "Abrir RDS",
        status: close.status,
        period
      }];
    }
    return [];
  });
}

function sortActions(left: StoreAgentAction, right: StoreAgentAction): number {
  const rank: Record<StoreAgentSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title, "es");
}

function buildInsights(input: {
  primary: StoreAgentPeriod;
  week: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
  attention: StoreAgentAction[];
}): string[] {
  const insights: string[] = [];
  const achievement = input.primary.metric.achievement;
  if (achievement !== null && achievement >= 100) {
    insights.push(`${input.primary.label} está arriba de meta; mantener foco en tickets y piezas para no depender solo de ticket alto.`);
  } else if (achievement !== null && achievement < 80) {
    insights.push(`${input.primary.label} va por debajo de meta; revisar cobertura, tráfico y tickets antes del cierre.`);
  }
  const monthDelta = input.monthContext.comparison?.salesDeltaPct;
  if (monthDelta !== null && monthDelta !== undefined) {
    const direction = monthDelta >= 0 ? "arriba" : "abajo";
    insights.push(`${input.monthContext.title} está ${Math.abs(monthDelta).toFixed(1)} % ${direction} contra ${input.monthContext.comparison?.label.toLowerCase()}.`);
  }
  const weekDelta = input.week.comparison?.salesDeltaPct;
  if (weekDelta !== null && weekDelta !== undefined && Math.abs(weekDelta) >= 10) {
    const direction = weekDelta >= 0 ? "subió" : "bajó";
    insights.push(`La semana ${direction} ${Math.abs(weekDelta).toFixed(1)} % contra la semana anterior comparable.`);
  }
  if (input.attention.length > 0) {
    insights.push(`Hay ${input.attention.length} situación(es) accionable(s); resolver primero las marcadas como críticas o de revisión.`);
  }
  return insights.slice(0, 4);
}

export function buildStoreAgent(input: {
  generatedAt?: Date;
  primary: StoreAgentPeriod;
  week: StoreAgentPeriod;
  monthContext: StoreAgentPeriod;
  attention: StoreAgentAction[];
}): StoreAgentBrief {
  const attention = input.attention.sort(sortActions);
  return {
    mode: "store-agent-operational-v1",
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    primaryKpi: input.primary,
    monthContext: input.monthContext,
    weekContext: input.week,
    attention,
    quickActions: [
      { id: "kpis", label: "Capturar KPIs", detail: "Venta, tickets, piezas, tráfico y metas.", route: { type: "retool", path: "/kpis" } },
      { id: "quota", label: "Cuota Justa", detail: "Mínimos, porcentajes y RDS semanal.", route: { type: "retool", path: "/cuota-justa" } },
      { id: "kardex", label: "Kardex", detail: "Inventario, movimientos y rondas.", route: { type: "retool", path: "/kardex" } },
      { id: "attendance", label: "Asistencia", detail: "Retardos, faltas y justificantes.", route: { type: "retool", path: "/asistencia" } },
      { id: "schedule", label: "Horarios", detail: "Cobertura y solicitudes de cambio.", route: { type: "retool", path: "/horarios" } },
      { id: "electronic", label: "Ticket electrónico", detail: "Captura semanal de CRM/POS.", route: { type: "retool", path: "/ticket-electronico" } }
    ],
    insights: buildInsights({ primary: input.primary, week: input.week, monthContext: input.monthContext, attention }),
    dataSources: [
      {
        label: "KPIs",
        source: "Kpi",
        range: "Hoy, semana RDV, mes retail, periodo anterior comparable y último mes cerrado",
        formula: "Suma venta/meta/tickets/piezas; UPT, AUR, EPT y cumplimiento salen de esos totales."
      },
      {
        label: "Conversión",
        source: "Kpi.traffic",
        range: "Por fecha dentro del periodo",
        formula: "Tráfico de tienda = máximo diario capturado; conversión = tickets / tráfico."
      },
      {
        label: "Acciones",
        source: "Schedule, Attendance, Pending, InventoryRound, WeeklyPerformanceClose",
        range: "Solo tienda autenticada",
        formula: "Cada acción sale de estado real abierto o timestamp faltante; no se infiere por texto."
      }
    ]
  };
}
