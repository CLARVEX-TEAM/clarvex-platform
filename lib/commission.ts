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
