import assert from "node:assert/strict";
import test from "node:test";
import { accruedCommission, commissionReference, resolveCommissionMinimum } from "../lib/commission";
import type { CommissionRule } from "../lib/types";

/**
 * Contra qué se mide el alcance de comisión.
 *
 * Los importes son los REALES del RDV de GUESS zona D (hoja «Tabulador» del
 * archivo de Galerías Monterrey), no inventados: gerente 90–95 % paga 10 619 de
 * bono fijo, y del 100 % en adelante 1.611 % sobre la venta de tienda.
 */
const guessGerenteZonaD: CommissionRule[] = [
  { id: "d1", storeId: "guess", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 80, maxAchievement: 84.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 6637, fixedAmountHigh: 6637, active: true },
  { id: "d2", storeId: "guess", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 85, maxAchievement: 89.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 8628, fixedAmountHigh: 8628, active: true },
  { id: "d3", storeId: "guess", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 90, maxAchievement: 94.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 10619, fixedAmountHigh: 10619, active: true },
  { id: "d4", storeId: "guess", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 95, maxAchievement: 99.99, commissionPercent: 0, payoutType: "FIXED", fixedAmount: 13273, fixedAmountHigh: 13273, active: true },
  { id: "d5", storeId: "guess", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.611, payoutType: "PERCENT", fixedAmount: null, fixedAmountHigh: null, active: true },
  { id: "d6", storeId: "guess", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 1.929, payoutType: "PERCENT", fixedAmount: null, fixedAmountHigh: null, active: true }
];

/** Meta mensual real de la tienda del archivo. */
const META = 268_974.03;

test("por defecto se mide contra el MÍNIMO, como siempre", () => {
  // Sin `basis`, la referencia es el mínimo derivado de la meta (meta ÷ 1.15).
  assert.equal(commissionReference({ goal: 115_000 }), 100_000);
  assert.equal(commissionReference({ goal: 115_000, basis: null }), 100_000);
  // Y respeta el mínimo sincronizado si lo hay.
  assert.equal(commissionReference({ goal: 115_000, minimum: 90_000 }), 90_000);
});

test("con base META la referencia es la meta, y el mínimo se ignora", () => {
  assert.equal(commissionReference({ goal: 115_000, basis: "META" }), 115_000);
  // Aunque venga un mínimo sincronizado, con base META no pinta nada.
  assert.equal(commissionReference({ goal: 115_000, minimum: 90_000, basis: "META" }), 115_000);
});

test("el denominador cambia el escalón, y con él lo que se paga", () => {
  // El caso que motivó todo esto: un gerente al 90 % de su meta.
  const ventaAl90 = META * 0.9;

  // Como dice el RDV de GUESS: venta ÷ meta → 90 % → escalón 90–95 → fijo.
  const conMeta = accruedCommission({ sales: ventaAl90, goal: META, rules: guessGerenteZonaD, role: "GERENTE", basis: "META" });
  assert.equal(Math.round(conMeta.achievement), 90);
  assert.equal(conMeta.payoutType, "FIXED");
  assert.equal(conMeta.amount, 10_619);

  // Contra el mínimo, ese mismo 90 % se convierte en ~103 % y cae en el tramo
  // de porcentaje: paga menos de la mitad. Por eso el denominador importa.
  const conMinimo = accruedCommission({ sales: ventaAl90, goal: META, rules: guessGerenteZonaD, role: "GERENTE" });
  assert.equal(Math.round(conMinimo.achievement), 104);
  assert.equal(conMinimo.payoutType, "PERCENT");
  assert.ok(conMinimo.amount < conMeta.amount / 2, "el tramo de porcentaje paga menos de la mitad que el fijo");
});

test("con base META, el 100 % de la meta entra en el tramo de porcentaje", () => {
  const result = accruedCommission({ sales: META, goal: META, rules: guessGerenteZonaD, role: "GERENTE", basis: "META" });
  assert.equal(Math.round(result.achievement), 100);
  assert.equal(result.payoutType, "PERCENT");
  assert.equal(result.percent, 1.611);
  // 268 974.03 × 1.611 % = 4 333.17
  assert.equal(result.amount, 4333.17);
});

test("con base META, por debajo del 80 % de la meta no se paga nada", () => {
  // La cifra real del archivo: 84 059 vendidos sobre 268 974 de meta = 31.3 %.
  const result = accruedCommission({ sales: 84_059, goal: META, rules: guessGerenteZonaD, role: "GERENTE", basis: "META" });
  assert.equal(result.achievement.toFixed(1), "31.3");
  assert.equal(result.amount, 0);
});

test("NO REGRESIÓN: sin `basis`, el esquema histórico no se mueve", () => {
  const legacy: CommissionRule[] = [
    { id: "l1", storeId: "tommy", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53, active: true },
    { id: "l2", storeId: "tommy", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91, active: true },
    { id: "l3", storeId: "tommy", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29, active: true }
  ];
  const result = accruedCommission({ sales: 120_000, goal: 115_000, minimum: 100_000, rules: legacy, role: "ASESOR" });
  assert.equal(result.achievement, 120);
  assert.equal(result.amount, 2748);
  // Y resolveCommissionMinimum sigue siendo la fuente para las tiendas de siempre.
  assert.equal(resolveCommissionMinimum(null, 115_000), 100_000);
});
