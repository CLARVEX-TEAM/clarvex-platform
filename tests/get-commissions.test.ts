import assert from "node:assert/strict";
import test from "node:test";
import { buildCommissionPerson } from "../lib/commission-read";
import type { CommissionRule } from "../lib/types";

const advisorRules: CommissionRule[] = [
  { id: "v1", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53, active: true },
  { id: "v2", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91, active: true },
  { id: "v3", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29, active: true }
];

const managerRules: CommissionRule[] = [
  { id: "g1", storeId: "store", role: "SUBGERENTE", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93, active: true },
  { id: "g2", storeId: "store", role: "SUBGERENTE", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16, active: true },
  { id: "g3", storeId: "store", role: "SUBGERENTE", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 1.39, active: true }
];

test("buildCommissionPerson: asesor usa venta÷mínimo y bracket correcto", () => {
  const person = buildCommissionPerson(
    { userId: "a1", userName: "Waira", role: "ASESOR", sales: 11000, goal: 11500, commissionMinimum: 10000 },
    advisorRules,
    "ASESOR"
  );
  assert.equal(person.hasMinimum, true);
  assert.equal(person.minimum, 10000);
  assert.equal(person.achievementVsMinimum, 110);
  assert.equal(person.commissionPercent, 1.91);
  assert.equal(person.commissionAmount, 210.1);
  assert.equal(person.nextBracket?.atTop, false);
  assert.equal(person.nextBracket?.nextPercent, 2.29);
});

test("buildCommissionPerson: sin mínimo sincronizado deriva meta÷1.15", () => {
  const person = buildCommissionPerson(
    { userId: "a1", userName: "Waira", role: "ASESOR", sales: 10000, goal: 11500, commissionMinimum: null },
    advisorRules,
    "ASESOR"
  );
  assert.equal(person.minimum, 10000);
  assert.equal(person.achievementVsMinimum, 100);
  assert.equal(person.commissionPercent, 1.91);
});

test("buildCommissionPerson: subgerente usa reglas de su rol sobre venta de tienda", () => {
  const person = buildCommissionPerson(
    { userId: "store", userName: "Tienda", role: "GERENTE", sales: 200000, goal: 230000, commissionMinimum: 200000 },
    managerRules,
    "SUBGERENTE"
  );
  assert.equal(person.role, "SUBGERENTE");
  assert.equal(person.achievementVsMinimum, 100);
  assert.equal(person.commissionPercent, 1.16);
  assert.equal(person.commissionAmount, 2320);
});
