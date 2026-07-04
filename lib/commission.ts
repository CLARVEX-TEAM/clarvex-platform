import type { CommissionRule, Role } from "@/lib/types";

export function findCommissionRule(rules: CommissionRule[], role: Role, achievement: number) {
  const rule = rules.find((item) => (
    item.active &&
    item.role === role &&
    achievement >= item.minAchievement &&
    (item.maxAchievement === null || item.maxAchievement === undefined || achievement <= item.maxAchievement)
  ));

  return rule;
}

// El mínimo de comisión equivale a meta ÷ 1.15 (al 100% de la meta el alcance vs
// mínimo da 115%). Se usa cuando el RDV no trae un mínimo sincronizado explícito.
export const MINIMUM_TO_GOAL_FACTOR = 1.15;

/** Mínimo de comisión: el sincronizado si existe (>0), si no se deriva de la meta. */
export function resolveCommissionMinimum(commissionMinimum: number | null | undefined, goal: number): number {
  if (commissionMinimum && commissionMinimum > 0) return commissionMinimum;
  return goal > 0 ? Math.round((goal / MINIMUM_TO_GOAL_FACTOR) * 100) / 100 : 0;
}

export type NextBracketGap = {
  atTop: boolean;
  currentPercent: number;
  nextPercent: number;
  targetAchievement: number;
  salesNeeded: number;
  extraCommission: number;
};

/**
 * Calcula cuánto falta vender para alcanzar el SIGUIENTE bracket de comisión.
 * El alcance se mide contra el mínimo (misma regla que el cálculo real).
 * No modifica el cálculo de comisión: solo lo lee para motivar la venta.
 */
export function computeNextBracketGap(input: { sales: number; minimum: number; rules: CommissionRule[]; role: Role }): NextBracketGap | null {
  if (input.minimum <= 0) return null;
  const achievement = (input.sales / input.minimum) * 100;
  const active = input.rules
    .filter((rule) => rule.active && rule.role === input.role)
    .sort((left, right) => left.minAchievement - right.minAchievement);
  if (active.length === 0) return null;
  const current = findCommissionRule(active, input.role, achievement);
  const currentPercent = current?.commissionPercent ?? 0;
  const next = active.find((rule) => rule.minAchievement > achievement);
  if (!next) {
    return { atTop: true, currentPercent, nextPercent: currentPercent, targetAchievement: current?.minAchievement ?? 0, salesNeeded: 0, extraCommission: 0 };
  }
  const targetSales = input.minimum * (next.minAchievement / 100);
  const salesNeeded = round2(Math.max(0, targetSales - input.sales));
  const extraCommission = round2(targetSales * (next.commissionPercent / 100) - input.sales * (currentPercent / 100));
  return { atTop: false, currentPercent, nextPercent: next.commissionPercent, targetAchievement: next.minAchievement, salesNeeded, extraCommission };
}

function round2(value: number) { return Math.round(value * 100) / 100; }

export type MonthlyCommissionProjection = {
  projectedSales: number;
  projectedCommission: number;
  percent: number;
  achievement: number;
};

/**
 * Proyecta la comisión de cierre de mes a partir de las SEMANAS con datos.
 * Como las metas, el mínimo y los horarios se cargan semana por semana, se
 * proyecta la venta al ritmo de las semanas ya capturadas (cada semana ya
 * refleja solo los días laborados). El nivel de comisión se toma del
 * cumplimiento REAL actual (venta ÷ mínimo de las semanas cargadas), NO de la
 * venta proyectada contra un mínimo incompleto.
 * No modifica el cálculo de comisión: reutiliza findCommissionRule + venta × %.
 */
export function projectMonthlyCommission(input: {
  salesToDate: number;
  minimumToDate: number;
  weeksElapsed: number;
  totalWeeks: number;
  rules: CommissionRule[];
  role: Role;
}): MonthlyCommissionProjection | null {
  // El alcance de comisión se mide contra el mínimo: sin mínimo no hay proyección.
  if (input.salesToDate <= 0 || input.weeksElapsed < 1 || input.totalWeeks < 1 || input.minimumToDate <= 0) return null;
  const weeksElapsed = Math.min(input.totalWeeks, input.weeksElapsed);
  const projectedSales = (input.salesToDate / weeksElapsed) * input.totalWeeks;
  const achievement = input.minimumToDate > 0 ? (input.salesToDate / input.minimumToDate) * 100 : 0;
  const rule = findCommissionRule(input.rules, input.role, achievement);
  const percent = rule?.commissionPercent ?? 0;
  return { projectedSales, projectedCommission: projectedSales * (percent / 100), percent, achievement };
}
