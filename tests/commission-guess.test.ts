import assert from "node:assert/strict";
import test from "node:test";
import {
  accruedCommission,
  computeNextBracketGap,
  isHighSeason,
  projectMonthlyCommission,
  rulePayout
} from "../lib/commission";
import type { CommissionRule } from "../lib/types";

/**
 * Esquema GUESS (agosto 2026): importe fijo de 80% a 99.99% y porcentaje del
 * 100% en adelante. El alcance se mide contra el MÍNIMO, como en toda la app.
 *
 * Importes del tabulador de VENDEDOR (en la app, ASESOR).
 */
const guessAdvisor: CommissionRule[] = [
  { id: "g1", storeId: "guess", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 80, maxAchievement: 84.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 1655, fixedAmountHigh: 4462, active: true },
  { id: "g2", storeId: "guess", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 85, maxAchievement: 89.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 2152, fixedAmountHigh: 5800, active: true },
  { id: "g3", storeId: "guess", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 90, maxAchievement: 94.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 2649, fixedAmountHigh: 7138, active: true },
  { id: "g4", storeId: "guess", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 95, maxAchievement: 99.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 3311, fixedAmountHigh: 8923, active: true },
  { id: "g5", storeId: "guess", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 2.025, payoutType: "PERCENT", fixedAmount: null, fixedAmountHigh: null, active: true },
  { id: "g6", storeId: "guess", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.427, payoutType: "PERCENT", fixedAmount: null, fixedAmountHigh: null, active: true }
];

/** Reglas del esquema histórico, sin payoutType: no deben cambiar de resultado. */
const legacyAdvisor: CommissionRule[] = [
  { id: "l1", storeId: "otra", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53, active: true },
  { id: "l2", storeId: "otra", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91, active: true },
  { id: "l3", storeId: "otra", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29, active: true }
];

test("Guess: por debajo del 80% no se paga nada", () => {
  // 79% del mínimo: ningún bracket casa, así que no hay comisión.
  const result = accruedCommission({ sales: 79_000, goal: 115_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" });
  assert.equal(result.achievement, 79);
  assert.equal(result.amount, 0);
  assert.equal(result.payoutType, "PERCENT");
});

test("Guess: bracket fijo paga el importe, no un porcentaje de la venta", () => {
  const result = accruedCommission({ sales: 92_000, goal: 115_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" });
  assert.equal(result.achievement, 92);
  assert.equal(result.payoutType, "FIXED");
  assert.equal(result.amount, 2649);
  assert.equal(result.fixedAmount, 2649);
  // Un bracket de importe fijo no tiene tasa que mostrar.
  assert.equal(result.percent, 0);
});

test("Guess: dentro del mismo escalón, vender más NO paga más", () => {
  const bajo = accruedCommission({ sales: 90_000, goal: 115_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" });
  const alto = accruedCommission({ sales: 94_900, goal: 115_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" });
  assert.equal(bajo.amount, alto.amount);
  assert.equal(alto.amount, 2649);
});

test("Guess: temporada alta cambia el importe fijo", () => {
  const scope = { sales: 92_000, goal: 115_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" as const };
  assert.equal(accruedCommission({ ...scope }).amount, 2649);
  assert.equal(accruedCommission({ ...scope, highSeason: true }).amount, 7138);
});

test("Guess: la temporada NO altera los brackets de porcentaje", () => {
  const scope = { sales: 120_000, goal: 115_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" as const };
  // 120% del mínimo → bracket +115% → 2.427% de la venta, en cualquier temporada.
  // 120 000 × 2.427% = 2 912.40. Los TRES decimales importan: con los dos que
  // permitía el Decimal(5,2) original, 2.427 se guardaba como 2.43 y esta misma
  // venta pagaba 2 916 — 3.60 de más al mes por persona, sin aviso.
  assert.equal(accruedCommission({ ...scope }).amount, 2912.4);
  assert.equal(accruedCommission({ ...scope, highSeason: true }).amount, 2912.4);
});

test("rulePayout: sin fixedAmountHigh cae al importe regular, nunca a cero", () => {
  const sinAlta: CommissionRule = { ...guessAdvisor[0]!, fixedAmountHigh: null };
  assert.equal(rulePayout(sinAlta, 90_000, true), 1655);
});

test("Guess: el salto al siguiente escalón usa importes reales, no resta de tasas", () => {
  const gap = computeNextBracketGap({ sales: 92_000, minimum: 100_000, rules: guessAdvisor, role: "ASESOR" });
  assert.ok(gap);
  // Del escalón 90–94.99 (2649) al 95–99.99 (3311): faltan 3 000 de venta.
  assert.equal(gap.salesNeeded, 3_000);
  assert.equal(gap.extraCommission, 662);
});

test("Guess: la proyección de cierre respeta el importe fijo", () => {
  // 2 de 4 semanas, 46 000 vendidos contra un mínimo a la fecha de 50 000 → 92%.
  const projection = projectMonthlyCommission({
    salesToDate: 46_000,
    minimumToDate: 50_000,
    weeksElapsed: 2,
    totalWeeks: 4,
    rules: guessAdvisor,
    role: "ASESOR"
  });
  assert.ok(projection);
  assert.equal(projection.achievement, 92);
  // Aunque la venta proyectada sea el doble, el escalón paga un fijo.
  assert.equal(projection.projectedSales, 92_000);
  assert.equal(projection.projectedCommission, 2649);
});

test("NO REGRESIÓN: las reglas sin payoutType siguen pagando venta × tasa", () => {
  const result = accruedCommission({ sales: 120_000, goal: 115_000, minimum: 100_000, rules: legacyAdvisor, role: "ASESOR" });
  assert.equal(result.achievement, 120);
  assert.equal(result.percent, 2.29);
  assert.equal(result.amount, 2748);
  assert.equal(result.payoutType, "PERCENT");
  assert.equal(result.fixedAmount, 0);
});

test("NO REGRESIÓN: el esquema histórico paga desde el primer peso", () => {
  const result = accruedCommission({ sales: 10_000, goal: 115_000, minimum: 100_000, rules: legacyAdvisor, role: "ASESOR" });
  assert.equal(result.amount, 153);
});

test("isHighSeason: los extremos del rango entran", () => {
  const seasons = [{ startDate: "2026-11-15", endDate: "2026-12-31" }];
  assert.equal(isHighSeason(seasons, "2026-11-14"), false);
  assert.equal(isHighSeason(seasons, "2026-11-15"), true);
  assert.equal(isHighSeason(seasons, "2026-12-31"), true);
  assert.equal(isHighSeason(seasons, "2027-01-01"), false);
});

test("isHighSeason: sin rangos capturados, temporada regular", () => {
  assert.equal(isHighSeason([], "2026-12-24"), false);
});
