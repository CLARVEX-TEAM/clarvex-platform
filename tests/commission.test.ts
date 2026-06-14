import assert from "node:assert/strict";
import test from "node:test";
import { findCommissionRule, projectMonthlyCommission } from "../lib/commission";
import type { CommissionRule } from "../lib/types";

const rules: CommissionRule[] = [
  { id: "sub-base", storeId: "store", role: "SUBGERENTE", minSales: 999999, maxSales: 1000000, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93, active: true },
  { id: "sub-middle", storeId: "store", role: "SUBGERENTE", minSales: 999999, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16, active: true },
  { id: "sub-top", storeId: "store", role: "SUBGERENTE", minSales: 999999, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 1.39, active: true }
];

const advisorRules: CommissionRule[] = [
  { id: "v1", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53, active: true },
  { id: "v2", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91, active: true },
  { id: "v3", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29, active: true }
];

test("SUBGERENTE con 80 por ciento usa 0.93 sin evaluar ventas", () => {
  assert.equal(findCommissionRule(rules, "SUBGERENTE", 80)?.commissionPercent, 0.93);
});

test("maxAchievement null no tiene limite superior", () => {
  assert.equal(findCommissionRule(rules, "SUBGERENTE", 180)?.commissionPercent, 1.39);
});

test("proyeccion: extrapola la venta por semanas con datos, no por dias", () => {
  const result = projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 90_000, weeksElapsed: 2, totalWeeks: 4, rules: advisorRules, role: "ASESOR" });
  assert.ok(result);
  assert.equal(result!.projectedSales, 200_000);
});

test("proyeccion: el nivel sale del cumplimiento REAL (venta/minimo cargados), no de la venta proyectada", () => {
  // venta 100k / minimo 90k = 111% -> bracket 1.91% (NO 200k/90k=222% -> 2.29%)
  const result = projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 90_000, weeksElapsed: 2, totalWeeks: 4, rules: advisorRules, role: "ASESOR" });
  assert.ok(result);
  assert.equal(result!.percent, 1.91);
  assert.equal(Math.round(result!.achievement), 111);
  assert.equal(result!.projectedCommission, 200_000 * 0.0191);
});

test("proyeccion: sin venta o sin semanas devuelve null", () => {
  assert.equal(projectMonthlyCommission({ salesToDate: 0, minimumToDate: 90_000, weeksElapsed: 2, totalWeeks: 4, rules: advisorRules, role: "ASESOR" }), null);
  assert.equal(projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 90_000, weeksElapsed: 0, totalWeeks: 4, rules: advisorRules, role: "ASESOR" }), null);
});

test("proyeccion: no extrapola si ya estan todas las semanas cargadas", () => {
  const result = projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 90_000, weeksElapsed: 4, totalWeeks: 4, rules: advisorRules, role: "ASESOR" });
  assert.ok(result);
  assert.equal(result!.projectedSales, 100_000);
});
