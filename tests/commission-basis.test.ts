import assert from "node:assert/strict";
import test from "node:test";
import { accruedCommission, commissionReference, MINIMUM_TO_GOAL_FACTOR } from "../lib/commission";
import { buildCommissionPerson } from "../lib/commission-read";
import type { CommissionRule } from "../lib/types";

/**
 * La BASE decide el denominador del alcance, y con el denominador cambia el
 * bracket y el pago. Es el fallo que estuvo vivo en produccion: nadie pasaba
 * `basis`, asi que una tienda GUESS —que mide contra la META— acababa midiendo
 * contra meta÷1.15, ~15 puntos de alcance de regalo.
 *
 * Cifras reales de GUESS Galerias Monterrey (zona D), agosto de 2026.
 */
const META = 70325.85;
const VENTA = 72593.27;

const REGLAS_GUESS: CommissionRule[] = [
  { id: "f80", storeId: "s", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 80, maxAchievement: 84.99, commissionPercent: 0, active: true, payoutType: "FIXED", fixedAmount: 1978, fixedAmountHigh: null },
  { id: "p100", storeId: "s", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.961, active: true, payoutType: "PERCENT", fixedAmount: null, fixedAmountHigh: null },
  { id: "p115", storeId: "s", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.353, active: true, payoutType: "PERCENT", fixedAmount: null, fixedAmountHigh: null }
];

test("con base META el alcance se mide contra la meta", () => {
  assert.equal(commissionReference({ goal: META, minimum: null, basis: "META" }), META);
});

test("sin base explicita se mide contra el minimo derivado, como el resto de marcas", () => {
  const esperado = Math.round((META / MINIMUM_TO_GOAL_FACTOR) * 100) / 100;
  assert.equal(commissionReference({ goal: META, minimum: null }), esperado);
  assert.equal(commissionReference({ goal: META, minimum: null, basis: "MINIMO" }), esperado);
});

test("olvidar la base cambia el bracket y sobrepaga", () => {
  const conBase = accruedCommission({ sales: VENTA, goal: META, minimum: null, rules: REGLAS_GUESS, role: "ASESOR", basis: "META" });
  const sinBase = accruedCommission({ sales: VENTA, goal: META, minimum: null, rules: REGLAS_GUESS, role: "ASESOR" });

  // Contra META: 103.22 % → bracket 100-114.99 → 1.961 %
  assert.equal(Math.round(conBase.achievement * 100) / 100, 103.22);
  assert.equal(conBase.percent, 1.961);
  assert.equal(conBase.amount, 1423.55);

  // Contra el minimo derivado: 118.71 % → salta al bracket de 115 % → 2.353 %
  assert.equal(Math.round(sinBase.achievement * 100) / 100, 118.71);
  assert.equal(sinBase.percent, 2.353);
  assert.ok(sinBase.amount > conBase.amount, "sin base se paga de mas");
});

test("una tienda de base MINIMO no cambia al pasar la base", () => {
  // Las tiendas Tommy tienen minimo real sincronizado: pasar `basis` no puede
  // moverles el numero.
  const minimo = 61000;
  const sinBase = accruedCommission({ sales: VENTA, goal: META, minimum: minimo, rules: REGLAS_GUESS, role: "ASESOR" });
  const conBase = accruedCommission({ sales: VENTA, goal: META, minimum: minimo, rules: REGLAS_GUESS, role: "ASESOR", basis: "MINIMO" });
  assert.deepEqual(sinBase, conBase);
});

test("un bracket de IMPORTE FIJO paga el importe, no venta x 0 %", () => {
  // Con 82 % de alcance cae en el escalon fijo. Multiplicar por su porcentaje
  // (que es 0) pagaria cero a quien si cumplio.
  const venta = META * 0.82;
  const resultado = accruedCommission({ sales: venta, goal: META, minimum: null, rules: REGLAS_GUESS, role: "ASESOR", basis: "META" });
  assert.equal(resultado.payoutType, "FIXED");
  assert.equal(resultado.amount, 1978);
});

test("buildCommissionPerson respeta la base y los importes fijos", () => {
  // Es la lectura que usa el Copilot: antes ignoraba las dos cosas.
  const persona = buildCommissionPerson(
    { userId: "u1", userName: "Fernanda", role: "ASESOR", sales: VENTA, goal: META, commissionMinimum: null },
    REGLAS_GUESS,
    "ASESOR",
    "META"
  );
  assert.equal(persona.minimum, META);
  assert.equal(persona.achievementVsMinimum, 103.22);
  assert.equal(persona.commissionAmount, 1423.55);

  const enFijo = buildCommissionPerson(
    { userId: "u1", userName: "Fernanda", role: "ASESOR", sales: META * 0.82, goal: META, commissionMinimum: null },
    REGLAS_GUESS,
    "ASESOR",
    "META"
  );
  assert.equal(enFijo.commissionAmount, 1978);
});
