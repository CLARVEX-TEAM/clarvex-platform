import type { Kpi } from "@/lib/types";

/** Un Decimal de Prisma, o el número plano equivalente. */
type Numeric = number | string | { toString(): string };

export type KpiRow = {
  userId: string;
  date: Date;
  dailySales: Numeric;
  monthlySales: Numeric;
  dailyGoal: Numeric;
  monthlyGoal: Numeric;
  avgTicket: Numeric;
  upt: Numeric;
  conversion: Numeric | null;
  traffic: number | null;
  pieces: number;
  transactions: number;
  ranking: number;
  grossSales: Numeric | null;
  discountAmount: Numeric | null;
  discountMargin: Numeric | null;
  discountLimit: Numeric | null;
  commissionAmount: Numeric;
  commissionPercent: Numeric;
  commissionMinimum: Numeric | null;
};

function nullableNumber(value: Numeric | null) {
  return value === null || value === undefined ? null : Number(value);
}

/**
 * Fila de Kpi de la BD → KPI que consumen las pantallas.
 *
 * `commissionMinimum` es obligatorio en el payload: el alcance de comisión se mide
 * contra el mínimo, y si el campo no viaja, la pantalla lo deriva de la meta
 * (meta ÷ 1.15) y muestra una tasa distinta a la de /kpis para la misma persona.
 */
export function toKpiPayload(row: KpiRow): Kpi {
  return {
    userId: row.userId,
    date: row.date.toISOString().slice(0, 10),
    dailySales: Number(row.dailySales),
    monthlySales: Number(row.monthlySales),
    dailyGoal: Number(row.dailyGoal),
    monthlyGoal: Number(row.monthlyGoal),
    avgTicket: Number(row.avgTicket),
    upt: Number(row.upt),
    conversion: nullableNumber(row.conversion),
    traffic: row.traffic,
    pieces: row.pieces,
    transactions: row.transactions,
    ranking: row.ranking,
    grossSales: nullableNumber(row.grossSales),
    discountAmount: nullableNumber(row.discountAmount),
    discountMargin: nullableNumber(row.discountMargin),
    discountLimit: nullableNumber(row.discountLimit),
    commissionAmount: Number(row.commissionAmount),
    commissionPercent: Number(row.commissionPercent),
    commissionMinimum: nullableNumber(row.commissionMinimum)
  };
}
