// Serie diaria de venta para la gráfica de tendencia. Pura y testeable.

export type TrendPoint = { date: string; label: string; sales: number; goal: number };

/**
 * Agrupa filas de KPI por día (sumando venta y meta), ignora días futuros y
 * devuelve los últimos `days` días con datos, en orden cronológico.
 * Sirve para tienda (todas las filas) o para un asesor (sus filas).
 */
export function buildSalesTrend(
  rows: Array<{ date?: string; dailySales: number; dailyGoal: number }>,
  todayKey: string,
  days = 14
): TrendPoint[] {
  const byDate = new Map<string, { sales: number; goal: number }>();
  for (const row of rows) {
    if (!row.date || row.date > todayKey) continue;
    const agg = byDate.get(row.date) ?? { sales: 0, goal: 0 };
    agg.sales += row.dailySales;
    agg.goal += row.dailyGoal;
    byDate.set(row.date, agg);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([date, value]) => ({ date, label: date.slice(8, 10), sales: Math.round(value.sales), goal: Math.round(value.goal) }));
}

/**
 * Serie diaria de un solo valor (suma por día), ignora días futuros y devuelve
 * los últimos `days` días con datos en orden cronológico. Para sparklines.
 */
export function buildDailySeries(
  rows: Array<{ date?: string; value: number }>,
  todayKey: string,
  days = 7
): number[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!row.date || row.date > todayKey) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.value);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([, value]) => Math.round(value));
}
