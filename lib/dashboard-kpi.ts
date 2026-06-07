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

export function buildUserDashboardKpi(date: string, row: DashboardKpiRow | null): DashboardDailyKpi {
  const dailyGoal = row?.dailyGoal ?? 0;
  const dailySales = row?.dailySales ?? 0;
  const transactions = row?.transactions ?? 0;
  const pieces = row?.pieces ?? 0;
  const traffic = row?.traffic ?? null;

  return {
    date,
    dailyGoal,
    dailySales,
    transactions,
    pieces,
    traffic,
    conversion: traffic !== null && traffic > 0
      ? Math.round((transactions / traffic) * 10000) / 100
      : null
  };
}
