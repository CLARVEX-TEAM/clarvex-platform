import { commissionReference, computeNextBracketGap, findCommissionRule, rulePayout, rulePercent, type CommissionBasis } from "@/lib/commission";
import { getAchievement } from "@/lib/kpi-view";
import type { CommissionRule, Role } from "@/lib/types";

export type CommissionPerson = {
  name: string;
  role: Role;
  sales: number;
  goal: number;
  minimum: number;
  achievementVsMinimum: number;
  commissionPercent: number;
  commissionAmount: number;
  hasMinimum: boolean;
  nextBracket: {
    atTop: boolean;
    currentPercent: number;
    nextPercent: number;
    salesNeeded: number;
    extraCommission: number;
  } | null;
};

export type CommissionPersonInternal = CommissionPerson & { userId: string };

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function publicCommissionPerson(person: CommissionPersonInternal): CommissionPerson {
  const { userId: _userId, ...rest } = person;
  return rest;
}

/** Misma lectura que la pestaña KPIs → Comisión (useKpiDerived). No recalcula reglas. */
export function buildCommissionPerson(
  item: {
    userId: string;
    userName: string;
    role: Role;
    sales: number;
    goal: number;
    commissionMinimum: number | null;
  },
  rules: CommissionRule[],
  commissionRole: Role,
  basis?: CommissionBasis | null
): CommissionPersonInternal {
  // La referencia es el mínimo, o la META si la tienda es de base META (GUESS).
  const minimum = commissionReference({ goal: item.goal, minimum: item.commissionMinimum, basis });
  const hasMinimum = minimum > 0;
  const achievementVsMinimum = hasMinimum ? getAchievement(item.sales, minimum) : 0;
  const activeRule = hasMinimum ? findCommissionRule(rules, commissionRole, achievementVsMinimum) : undefined;
  const commissionPercent = rulePercent(activeRule);
  // `rulePayout` y no venta × %: los brackets de GUESS entre 80 y 99.99 % pagan
  // un IMPORTE FIJO, cuyo porcentaje es 0.
  const commissionAmount = hasMinimum ? round2(rulePayout(activeRule, item.sales)) : 0;
  const gap = hasMinimum
    ? computeNextBracketGap({ sales: item.sales, minimum, rules, role: commissionRole })
    : null;

  return {
    userId: item.userId,
    name: item.userName,
    role: commissionRole,
    sales: round2(item.sales),
    goal: round2(item.goal),
    minimum: round2(minimum),
    achievementVsMinimum: round2(achievementVsMinimum),
    commissionPercent,
    commissionAmount,
    hasMinimum,
    nextBracket: gap
      ? {
          atTop: gap.atTop,
          currentPercent: gap.currentPercent,
          nextPercent: gap.nextPercent,
          salesNeeded: gap.salesNeeded,
          extraCommission: gap.extraCommission
        }
      : null
  };
}

export function pickClosestToNextBracket(team: CommissionPersonInternal[]): CommissionPersonInternal | null {
  const candidates = team
    .filter((person) => person.hasMinimum && person.nextBracket && !person.nextBracket.atTop)
    .sort((a, b) => (a.nextBracket?.salesNeeded ?? Infinity) - (b.nextBracket?.salesNeeded ?? Infinity));
  return candidates[0] ?? null;
}

export function activeCommissionRulesSummary(rules: CommissionRule[]) {
  return rules
    .filter((rule) => rule.active && rule.role)
    .sort((a, b) => String(a.role).localeCompare(String(b.role)) || a.minAchievement - b.minAchievement)
    .map((rule) => ({
      role: rule.role as Role,
      minAchievement: rule.minAchievement,
      maxAchievement: rule.maxAchievement ?? null,
      commissionPercent: rule.commissionPercent
    }));
}
