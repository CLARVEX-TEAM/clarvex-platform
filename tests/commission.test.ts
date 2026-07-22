import assert from "node:assert/strict";
import test from "node:test";
import { accruedCommission, computeNextBracketGap, findCommissionRule, projectMonthlyCommission, resolveCommissionMinimum } from "../lib/commission";
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

test("minimo: usa el sincronizado si existe, si no lo deriva de meta/1.15", () => {
  // Con minimo sincronizado, lo respeta tal cual.
  assert.equal(resolveCommissionMinimum(90_000, 100_000), 90_000);
  // Sin minimo, deriva de la meta: 115_000 / 1.15 = 100_000.
  assert.equal(resolveCommissionMinimum(null, 115_000), 100_000);
  assert.equal(resolveCommissionMinimum(0, 115_000), 100_000);
  // Sin meta tampoco, devuelve 0.
  assert.equal(resolveCommissionMinimum(null, 0), 0);
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

test("proyeccion: sin venta, sin semanas o sin minimo devuelve null", () => {
  assert.equal(projectMonthlyCommission({ salesToDate: 0, minimumToDate: 90_000, weeksElapsed: 2, totalWeeks: 4, rules: advisorRules, role: "ASESOR" }), null);
  assert.equal(projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 90_000, weeksElapsed: 0, totalWeeks: 4, rules: advisorRules, role: "ASESOR" }), null);
  // El alcance de comision se mide contra el minimo: sin minimo, no hay proyeccion (no cae a meta).
  assert.equal(projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 0, weeksElapsed: 2, totalWeeks: 4, rules: advisorRules, role: "ASESOR" }), null);
});

test("proyeccion: no extrapola si ya estan todas las semanas cargadas", () => {
  const result = projectMonthlyCommission({ salesToDate: 100_000, minimumToDate: 90_000, weeksElapsed: 4, totalWeeks: 4, rules: advisorRules, role: "ASESOR" });
  assert.ok(result);
  assert.equal(result!.projectedSales, 100_000);
});

test("siguiente bracket: calcula venta faltante y comision extra", () => {
  // 80k / 100k = 80% -> siguiente bracket 100% (1.91%): faltan 20k
  const gap = computeNextBracketGap({ sales: 80_000, minimum: 100_000, rules: advisorRules, role: "ASESOR" });
  assert.ok(gap);
  assert.equal(gap!.atTop, false);
  assert.equal(gap!.salesNeeded, 20_000);
  assert.equal(gap!.targetAchievement, 100);
  assert.equal(gap!.currentPercent, 1.53);
  assert.equal(gap!.nextPercent, 1.91);
  // extra = 100k*1.91% - 80k*1.53% = 1910 - 1224 = 686
  assert.equal(gap!.extraCommission, 686);
});

test("siguiente bracket: en 111 por ciento apunta al 115", () => {
  const gap = computeNextBracketGap({ sales: 111_000, minimum: 100_000, rules: advisorRules, role: "ASESOR" });
  assert.ok(gap);
  assert.equal(gap!.targetAchievement, 115);
  assert.equal(gap!.salesNeeded, 4_000);
  assert.equal(gap!.nextPercent, 2.29);
});

test("siguiente bracket: en el nivel maximo devuelve atTop", () => {
  const gap = computeNextBracketGap({ sales: 130_000, minimum: 100_000, rules: advisorRules, role: "ASESOR" });
  assert.ok(gap);
  assert.equal(gap!.atTop, true);
  assert.equal(gap!.currentPercent, 2.29);
  assert.equal(gap!.salesNeeded, 0);
});

test("siguiente bracket: sin minimo o sin reglas devuelve null", () => {
  assert.equal(computeNextBracketGap({ sales: 80_000, minimum: 0, rules: advisorRules, role: "ASESOR" }), null);
  assert.equal(computeNextBracketGap({ sales: 80_000, minimum: 100_000, rules: [], role: "ASESOR" }), null);
  // Reglas de otro rol no aplican
  assert.equal(computeNextBracketGap({ sales: 80_000, minimum: 100_000, rules: advisorRules, role: "GERENTE" }), null);
});

test("comision acumulada: venta 99k / minimo 90k = 110% -> 1.91% del ASESOR", () => {
  const c = accruedCommission({ sales: 99_000, goal: 103_500, minimum: 90_000, rules: advisorRules, role: "ASESOR" });
  assert.equal(c.percent, 1.91);
  assert.equal(Math.round(c.achievement), 110); // 99000/90000
  assert.equal(c.amount, 1890.9); // round2(99000 * 0.0191)
});

test("comision acumulada: SUBGERENTE que supera el minimo no sale en 0", () => {
  // minimo derivado de meta: 74_628.50 / 1.15 = 64_894.35 -> alcance 116% -> 1.39%
  const c = accruedCommission({ sales: 75_846.96, goal: 74_628.5, minimum: null, rules, role: "SUBGERENTE" });
  assert.equal(c.percent, 1.39);
  assert.ok(c.amount > 0);
});

test("comision acumulada: sin venta da 0 sin reventar", () => {
  const c = accruedCommission({ sales: 0, goal: 100_000, minimum: null, rules: advisorRules, role: "ASESOR" });
  assert.equal(c.amount, 0);
  assert.equal(c.percent, 1.53);
});
