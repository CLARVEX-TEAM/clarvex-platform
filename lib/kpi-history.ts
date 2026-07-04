import { aggregateKpis, aggregateStore, aggregateStoreTraffic, type RawKpi } from "./kpi-report";

// Histórico de KPIs por semana retail. Reutiliza la agregación ya probada
// (aggregateKpis/aggregateStore) para que los números coincidan con la vista
// Semana de KPIs. Gerencia ve totales de tienda; asesor solo lo suyo.

export type WeekHistoryPoint = {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  sales: number;
  goal: number;
  achievement: number;
  transactions: number;
  pieces: number;
  traffic: number | null;
  upt: number | null;
  aur: number | null;
  ept: number | null;
  conversion: number | null;
};

type HistoryRow = RawKpi & {
  date: Date;
  traffic: number | null;
  weekNumber: number | null;
  weekStart: Date | null;
  weekEnd: Date | null;
};

export function buildWeekHistory(rows: HistoryRow[], ownUserId: string | null = null): WeekHistoryPoint[] {
  const byWeek = new Map<string, { weekNumber: number; weekStart: Date; weekEnd: Date; rows: HistoryRow[] }>();
  for (const row of rows) {
    if (row.weekNumber === null || !row.weekStart || !row.weekEnd) continue;
    const key = row.weekStart.toISOString();
    const group = byWeek.get(key) ?? { weekNumber: row.weekNumber, weekStart: row.weekStart, weekEnd: row.weekEnd, rows: [] };
    group.rows.push(row);
    byWeek.set(key, group);
  }
  const points: WeekHistoryPoint[] = [];
  for (const group of Array.from(byWeek.values())) {
    const reports = aggregateKpis(group.rows);
    const source = ownUserId
      ? reports.find((report) => report.userId === ownUserId)
      : aggregateStore(reports, aggregateStoreTraffic(group.rows));
    if (!source) continue;
    points.push({
      weekNumber: group.weekNumber,
      weekStart: group.weekStart.toISOString().slice(0, 10),
      weekEnd: group.weekEnd.toISOString().slice(0, 10),
      sales: source.sales,
      goal: source.goal,
      achievement: source.achievement,
      transactions: source.transactions,
      pieces: source.pieces,
      traffic: source.traffic,
      upt: source.upt,
      aur: source.aur,
      ept: source.ept,
      conversion: source.conversion
    });
  }
  return points.sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

/** Cambio porcentual vs el valor anterior (1 decimal); null si no es comparable. */
export function percentDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
