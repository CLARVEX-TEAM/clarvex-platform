export type KpiReportItem = {
  userId: string;
  userName: string;
  role: "GERENTE" | "SUBGERENTE" | "ASESOR";
  avatar: string;
  photoUrl: string | null;
  sales: number;
  goal: number;
  achievement: number;
  transactions: number;
  pieces: number;
  upt: number | null;
  aur: number | null;
  ept: number | null;
  conversion: number | null;
  traffic: number | null;
  ranking: number;
  grossSales: number | null;
  discountAmount: number | null;
  discountMargin: number | null;
  discountLimit: number | null;
  commissionAmount: number;
  commissionPercent: number;
};

type RawKpi = {
  id?: string;
  userId: string;
  date?: Date;
  dailySales: unknown;
  dailyGoal: unknown;
  transactions: number;
  pieces: number;
  conversion: unknown;
  traffic: number | null;
  grossSales: unknown | null;
  discountAmount: unknown | null;
  discountLimit: unknown | null;
  commissionAmount: unknown;
  commissionPercent: unknown;
  user: { name: string; role: KpiReportItem["role"]; photoUrl: string | null };
};

export function aggregateKpis(rows: RawKpi[]) {
  const groups = new Map<string, RawKpi[]>();
  const uniqueRows = new Map<string, RawKpi>();
  for (const row of rows) {
    const dateKey = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.id ?? String(uniqueRows.size);
    const key = `${row.userId}:${dateKey}`;
    const existing = uniqueRows.get(key);
    if (!existing || isCanonicalRdvDate(row.date) || !isCanonicalRdvDate(existing.date)) uniqueRows.set(key, row);
  }
  for (const row of Array.from(uniqueRows.values())) groups.set(row.userId, [...(groups.get(row.userId) ?? []), row]);

  const reports = Array.from(groups.values()).map((items) => {
    const first = items[0];
    const sales = sum(items, "dailySales");
    const goal = goalSum(items);
    const transactions = items.reduce((total, item) => total + item.transactions, 0);
    const pieces = items.reduce((total, item) => total + item.pieces, 0);
    const traffic = nullableIntegerSum(items.map((item) => item.traffic));
    const grossSales = nullableSum(items, "grossSales");
    const discountAmount = nullableSum(items, "discountAmount");
    const discountMargin = grossSales && discountAmount !== null ? round((discountAmount / grossSales) * 100) : null;
    return {
      userId: first.userId,
      userName: first.user.name,
      role: first.user.role,
      avatar: first.user.name.slice(0, 2).toUpperCase(),
      photoUrl: first.user.photoUrl,
      sales,
      goal,
      achievement: ratio(sales * 100, goal),
      transactions,
      pieces,
      upt: transactions > 0 ? ratio(pieces, transactions) : null,
      aur: pieces > 0 ? ratio(sales, pieces) : null,
      ept: transactions > 0 ? ratio(sales, transactions) : null,
      conversion: traffic ? ratio(transactions * 100, traffic) : null,
      traffic,
      ranking: 0,
      grossSales,
      discountAmount,
      discountMargin,
      discountLimit: latestNullable(items, "discountLimit"),
      commissionAmount: sum(items, "commissionAmount"),
      commissionPercent: latest(items, "commissionPercent")
    } satisfies KpiReportItem;
  });

  reports.sort((left, right) => right.achievement - left.achievement || right.sales - left.sales);
  reports.forEach((item, index) => { item.ranking = index + 1; });
  return reports;
}

export function aggregateStore(
  items: KpiReportItem[],
  trafficOverride?: number | null,
  goalOverride?: number,
  transactionsOverride?: number,
  piecesOverride?: number
): KpiReportItem | null {
  if (items.length === 0) return null;
  const sales = items.reduce((total, item) => total + item.sales, 0);
  const goal = goalOverride ?? items.reduce((total, item) => total + item.goal, 0);
  const transactions = transactionsOverride ?? items.reduce((total, item) => total + item.transactions, 0);
  const pieces = piecesOverride ?? items.reduce((total, item) => total + item.pieces, 0);
  const traffic = trafficOverride === undefined ? maxNullable(items.map((item) => item.traffic)) : trafficOverride;
  const grossSales = nullableNumberSum(items.map((item) => item.grossSales));
  const discountAmount = nullableNumberSum(items.map((item) => item.discountAmount));
  return {
    userId: "store",
    userName: "Tienda",
    role: "GERENTE",
    avatar: "TI",
    photoUrl: null,
    sales,
    goal,
    achievement: ratio(sales * 100, goal),
    transactions,
    pieces,
    upt: transactions > 0 ? ratio(pieces, transactions) : null,
    aur: pieces > 0 ? ratio(sales, pieces) : null,
    ept: transactions > 0 ? ratio(sales, transactions) : null,
    conversion: traffic ? ratio(transactions * 100, traffic) : null,
    traffic,
    ranking: 0,
    grossSales,
    discountAmount,
    discountMargin: grossSales && discountAmount !== null ? round((discountAmount / grossSales) * 100) : null,
    discountLimit: null,
    commissionAmount: items.reduce((total, item) => total + item.commissionAmount, 0),
    commissionPercent: 0
  };
}

export function aggregateStoreTraffic(rows: Array<{ date: Date; traffic: number | null }>) {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!row.traffic) continue;
    const key = row.date.toISOString().slice(0, 10);
    byDate.set(key, Math.max(byDate.get(key) ?? 0, row.traffic));
  }
  return byDate.size ? Array.from(byDate.values()).reduce((total, traffic) => total + traffic, 0) : null;
}

function goalSum(items: RawKpi[]): number {
  const values = items.map((item) => number(item.dailyGoal));
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return 0;
  // When all days have their own goal, sum them directly.
  if (nonZero.length === values.length) return round(values.reduce((total, v) => total + v, 0));
  // When the Excel only placed the daily goal in one row per week (other days = 0),
  // use the average of non-zero values as the per-day rate and apply to all days.
  const avgDailyGoal = nonZero.reduce((total, v) => total + v, 0) / nonZero.length;
  return round(avgDailyGoal * values.length);
}
function sum<T extends RawKpi>(items: T[], key: keyof T) { return round(items.reduce((total, item) => total + number(item[key]), 0)); }
function nullableSum<T extends RawKpi>(items: T[], key: keyof T) { return nullableNumberSum(items.map((item) => item[key] === null ? null : number(item[key]))); }
function nullableNumberSum(values: Array<number | null>) { const present = values.filter((value): value is number => value !== null); return present.length ? round(present.reduce((total, value) => total + value, 0)) : null; }
function nullableIntegerSum(values: Array<number | null>) { const present = values.filter((value): value is number => value !== null); return present.length ? present.reduce((total, value) => total + value, 0) : null; }
function maxNullable(values: Array<number | null>) { const present = values.filter((value): value is number => value !== null); return present.length ? Math.max(...present) : null; }
function latest<T extends RawKpi>(items: T[], key: keyof T) { return number(items.at(-1)?.[key]); }
function latestNullable<T extends RawKpi>(items: T[], key: keyof T) { const value = items.map((item) => item[key]).findLast((item) => item !== null); return value === undefined ? null : number(value); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function ratio(numerator: number, denominator: number) { return denominator > 0 ? round(numerator / denominator) : 0; }
function round(value: number) { return Math.round(value * 100) / 100; }
function isCanonicalRdvDate(value: Date | undefined) { return value instanceof Date && value.getUTCHours() === 0 && value.getUTCMinutes() === 0; }
