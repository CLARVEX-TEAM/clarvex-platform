const DEFAULT_TIME_ZONE = "America/Mexico_City";

export type DashboardKpiRow = {
  dailyGoal: number;
  dailySales: number;
  transactions: number;
  pieces: number;
  traffic: number | null;
};

export type DashboardDailyKpi = DashboardKpiRow & {
  date: string;
  conversion: number | null;
};

export function dashboardDateKey(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function dashboardDateRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function aggregateDashboardKpis(date: string, rows: DashboardKpiRow[]): DashboardDailyKpi {
  const totals = rows.reduce<DashboardKpiTotals>((result, row) => ({
    dailyGoal: result.dailyGoal + row.dailyGoal,
    dailySales: result.dailySales + row.dailySales,
    transactions: result.transactions + row.transactions,
    pieces: result.pieces + row.pieces,
    traffic: result.traffic + (row.traffic ?? 0),
    hasTraffic: result.hasTraffic || row.traffic !== null
  }), { dailyGoal: 0, dailySales: 0, transactions: 0, pieces: 0, traffic: 0, hasTraffic: false });

  return {
    date,
    dailyGoal: totals.dailyGoal,
    dailySales: totals.dailySales,
    transactions: totals.transactions,
    pieces: totals.pieces,
    traffic: totals.hasTraffic ? totals.traffic : null,
    conversion: totals.hasTraffic && totals.traffic > 0
      ? Math.round((totals.transactions / totals.traffic) * 10000) / 100
      : null
  };
}

type DashboardKpiTotals = {
  dailyGoal: number;
  dailySales: number;
  transactions: number;
  pieces: number;
  traffic: number;
  hasTraffic: boolean;
};
