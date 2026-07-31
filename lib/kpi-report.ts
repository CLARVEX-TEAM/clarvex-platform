import type { Role } from "@/lib/types";

export type KpiReportItem = {
  userId: string;
  userName: string;
  role: Role;
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
  orkestraSales: number | null;
  orkestraTransactions: number | null;
  orkestraPieces: number | null;
  /** Tickets electronicos del periodo. null = no se ha capturado. */
  crmTransactions: number | null;
  /** Denominador que le corresponde, congelado al capturar. */
  posTransactions: number | null;
  discountAmount: number | null;
  discountMargin: number | null;
  discountLimit: number | null;
  commissionAmount: number;
  commissionPercent: number;
  commissionMinimum: number | null;
};

export type RawKpi = {
  id?: string;
  userId: string;
  date?: Date;
  dailySales: unknown;
  dailyGoal: unknown;
  monthlyGoal?: unknown;
  transactions: number;
  pieces: number;
  conversion: unknown;
  traffic: number | null;
  grossSales: unknown | null;
  orkestraSales?: unknown | null;
  orkestraTransactions?: number | null;
  orkestraPieces?: number | null;
  /** Ticket electronico: viven SOLO en la fila ancla de la semana (ver CLAUDE.md). */
  crmTransactions?: number | null;
  posTransactions?: number | null;
  discountAmount: unknown | null;
  discountLimit: unknown | null;
  commissionAmount: unknown;
  commissionPercent: unknown;
  commissionMinimum?: unknown;
  user: { name: string; role: KpiReportItem["role"]; photoUrl: string | null };
};

export function aggregateKpis(rows: RawKpi[], useMonthlyGoal = false, workingKeys?: Set<string>) {
  const groups = new Map<string, RawKpi[]>();
  const uniqueRows = new Map<string, RawKpi>();
  for (const row of rows) {
    const dateKey = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.id ?? String(uniqueRows.size);
    const key = `${row.userId}:${dateKey}`;
    const existing = uniqueRows.get(key);
    if (!existing || isCanonicalRdvDate(row.date) || !isCanonicalRdvDate(existing.date)) uniqueRows.set(key, row);
  }
  for (const row of Array.from(uniqueRows.values())) groups.set(row.userId, [...(groups.get(row.userId) ?? []), row]);

  // Tráfico de la tienda por día (cada fila del día trae el mismo valor).
  const dailyTraffic = new Map<string, number>();
  for (const row of Array.from(uniqueRows.values())) {
    if (!row.traffic || !(row.date instanceof Date)) continue;
    const key = row.date.toISOString().slice(0, 10);
    dailyTraffic.set(key, Math.max(dailyTraffic.get(key) ?? 0, row.traffic));
  }

  const reports = Array.from(groups.values()).map((items) => {
    const first = items[0];
    const sales = sum(items, "dailySales");
    const goal = goalSum(items, useMonthlyGoal);
    const transactions = items.reduce((total, item) => total + item.transactions, 0);
    const pieces = items.reduce((total, item) => total + item.pieces, 0);
    // Tráfico del colaborador — misma regla que el formato manual de tienda,
    // para TODOS los roles: la suma del tráfico de la tienda SOLO en sus días
    // laborados (hoja HORARIOS). Sin horarios sincronizados, fallback a los
    // días con actividad (tickets o venta).
    const traffic = computeMemberTraffic(first, items, dailyTraffic, workingKeys);
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
      orkestraSales: nullableNumberSum(items.map((item) => item.orkestraSales === null || item.orkestraSales === undefined ? null : number(item.orkestraSales))),
      orkestraTransactions: nullableIntegerSum(items.map((item) => item.orkestraTransactions ?? null)),
      orkestraPieces: nullableIntegerSum(items.map((item) => item.orkestraPieces ?? null)),
      // Solo viven en la fila ancla de cada semana, asi que sumar los dias del
      // periodo da el total del periodo sin duplicar.
      crmTransactions: nullableIntegerSum(items.map((item) => item.crmTransactions ?? null)),
      posTransactions: nullableIntegerSum(items.map((item) => item.posTransactions ?? null)),
      discountAmount,
      discountMargin,
      discountLimit: latestNullable(items, "discountLimit"),
      commissionAmount: sum(items, "commissionAmount"),
      commissionPercent: latest(items, "commissionPercent"),
      commissionMinimum: latestNullable(items, "commissionMinimum")
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
  piecesOverride?: number,
  commissionMinimumOverride?: number | null
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
    orkestraSales: nullableNumberSum(items.map((item) => item.orkestraSales)),
    orkestraTransactions: nullableIntegerSum(items.map((item) => item.orkestraTransactions)),
    orkestraPieces: nullableIntegerSum(items.map((item) => item.orkestraPieces)),
    crmTransactions: nullableIntegerSum(items.map((item) => item.crmTransactions ?? null)),
    posTransactions: nullableIntegerSum(items.map((item) => item.posTransactions ?? null)),
    discountAmount,
    discountMargin: grossSales && discountAmount !== null ? round((discountAmount / grossSales) * 100) : null,
    discountLimit: null,
    commissionAmount: items.reduce((total, item) => total + item.commissionAmount, 0),
    commissionPercent: 0,
    commissionMinimum: commissionMinimumOverride ?? null
  };
}

function computeMemberTraffic(
  first: RawKpi,
  items: RawKpi[],
  dailyTraffic: Map<string, number>,
  workingKeys?: Set<string>
): number | null {
  const prefix = `${first.userId}:`;
  const workedDates = workingKeys ? Array.from(workingKeys).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)) : [];
  if (workedDates.length > 0) {
    const total = workedDates.reduce((sum, date) => sum + (dailyTraffic.get(date) ?? 0), 0);
    return total > 0 ? total : null;
  }
  return nullableIntegerSum(items.map((item) => item.transactions > 0 || number(item.dailySales) > 0 ? item.traffic : null));
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

/** Snapshot para IA alineado con la pestaña KPIs (tráfico por día, sin duplicar filas). */
export function buildAiKpiSnapshot(
  rows: Array<{
    userId: string;
    date: Date;
    dailySales: unknown;
    dailyGoal: unknown;
    transactions: number;
    pieces: number;
    conversion: unknown;
    traffic: number | null;
    user: { name: string; role: Role; photoUrl: string | null };
  }>
) {
  const normalized: RawKpi[] = rows.map((row) => ({
    userId: row.userId,
    date: row.date,
    dailySales: row.dailySales,
    dailyGoal: row.dailyGoal,
    transactions: row.transactions,
    pieces: row.pieces,
    conversion: row.conversion,
    traffic: row.traffic,
    grossSales: null,
    discountAmount: null,
    discountLimit: null,
    commissionAmount: 0,
    commissionPercent: 0,
    user: row.user
  }));
  const reports = aggregateKpis(normalized);
  const traffic = aggregateStoreTraffic(normalized.map((row) => ({ date: row.date as Date, traffic: row.traffic })));
  const store = aggregateStore(reports, traffic);
  const advisors = reports.filter((row) => row.role === "ASESOR");
  return { store, advisors, reports, traffic };
}

function goalSum(items: RawKpi[], useMonthlyGoal: boolean): number {
  if (useMonthlyGoal) {
    const monthly = items.map((item) => number(item.monthlyGoal)).find((v) => v > 0);
    if (monthly) return monthly;
  }
  const nonZero = items.map((item) => number(item.dailyGoal)).filter((v) => v > 0);
  return nonZero.length > 0 ? round(nonZero.reduce((total, v) => total + v, 0)) : 0;
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
