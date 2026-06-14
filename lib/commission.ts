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
  if (input.salesToDate <= 0 || input.weeksElapsed < 1 || input.totalWeeks < 1) return null;
  const weeksElapsed = Math.min(input.totalWeeks, input.weeksElapsed);
  const projectedSales = (input.salesToDate / weeksElapsed) * input.totalWeeks;
  const achievement = input.minimumToDate > 0 ? (input.salesToDate / input.minimumToDate) * 100 : 0;
  const rule = findCommissionRule(input.rules, input.role, achievement);
  const percent = rule?.commissionPercent ?? 0;
  return { projectedSales, projectedCommission: projectedSales * (percent / 100), percent, achievement };
}
