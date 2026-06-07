import assert from "node:assert/strict";
import test from "node:test";
import { findCommissionRule } from "../lib/commission";
import type { CommissionRule } from "../lib/types";

const rules: CommissionRule[] = [
  { id: "sub-base", storeId: "store", role: "SUBGERENTE", minSales: 999999, maxSales: 1000000, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93, active: true },
  { id: "sub-middle", storeId: "store", role: "SUBGERENTE", minSales: 999999, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16, active: true },
  { id: "sub-top", storeId: "store", role: "SUBGERENTE", minSales: 999999, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 1.39, active: true }
];

test("SUBGERENTE con 80 por ciento usa 0.93 sin evaluar ventas", () => {
  assert.equal(findCommissionRule(rules, "SUBGERENTE", 80)?.commissionPercent, 0.93);
});

test("maxAchievement null no tiene limite superior", () => {
  assert.equal(findCommissionRule(rules, "SUBGERENTE", 180)?.commissionPercent, 1.39);
});
