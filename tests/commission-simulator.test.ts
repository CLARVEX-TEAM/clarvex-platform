import assert from "node:assert/strict";
import test from "node:test";
import { buildCommissionSimulation } from "../lib/commission";
import { toKpiPayload, type KpiRow } from "../lib/kpi-payload";
import type { CommissionRule } from "../lib/types";

const advisorRules: CommissionRule[] = [
  { id: "v1", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53, active: true },
  { id: "v2", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91, active: true },
  { id: "v3", storeId: "store", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29, active: true }
];

// Mes de un asesor: venta 100k, meta 115k, mínimo sincronizado 100k.
const monthly = { sales: 100_000, goal: 115_000, minimum: 100_000, rules: advisorRules, role: "ASESOR" as const };

test("simulador: usa el minimo sincronizado, no la meta", () => {
  const sim = buildCommissionSimulation(monthly);
  assert.equal(sim.real.minimum, 100_000);
  // 100k / 100k = 100% -> bracket medio
  assert.equal(Math.round(sim.real.achievement), 100);
  assert.equal(sim.real.percent, 1.91);
  assert.equal(sim.real.amount, 1_910);
});

test("simulador: sin minimo sincronizado lo deriva de la meta (meta/1.15)", () => {
  const sim = buildCommissionSimulation({ ...monthly, minimum: null });
  assert.equal(sim.real.minimum, 100_000); // 115_000 / 1.15
});

test("simulador: sin venta simulada arranca en la venta real", () => {
  const sim = buildCommissionSimulation(monthly);
  assert.equal(sim.simulatedSales, 100_000);
  assert.equal(sim.simulated.amount, sim.real.amount);
});

test("simulador: mover el deslizador sube la tasa sin tocar la comision real", () => {
  const sim = buildCommissionSimulation({ ...monthly, simulatedSales: 120_000 });
  // 120k / 100k = 120% -> bracket alto
  assert.equal(sim.simulated.percent, 2.29);
  assert.equal(sim.simulated.amount, 2_748);
  // La comisión REAL se queda en la venta ya hecha.
  assert.equal(sim.real.percent, 1.91);
  assert.equal(sim.real.amount, 1_910);
});

test("simulador: dice cuanto falta vender para llegar a la venta simulada", () => {
  // Lleva 160k de un mes con minimo 300k, simula 300k -> le faltan 140k.
  const sim = buildCommissionSimulation({ ...monthly, sales: 160_000, goal: 345_000, minimum: 300_000, simulatedSales: 300_000 });
  assert.equal(sim.simulatedSales, 300_000); // dentro del rango, no se recorta
  assert.equal(sim.salesToSimulated, 140_000);
  // Y la comisión extra es la diferencia contra la que ya lleva, no la total.
  assert.equal(sim.extraCommissionVsReal, sim.simulated.amount - sim.real.amount);
  assert.ok(sim.extraCommissionVsReal > 0);
});

test("simulador: sin mover el deslizador no falta nada ni hay comision extra", () => {
  const sim = buildCommissionSimulation(monthly);
  assert.equal(sim.salesToSimulated, 0);
  assert.equal(sim.extraCommissionVsReal, 0);
});

test("simulador: lo que falta se mide contra la venta simulada ya acotada", () => {
  // Pedir menos que la venta real no da un faltante negativo.
  const sim = buildCommissionSimulation({ ...monthly, simulatedSales: 10_000 });
  assert.equal(sim.salesToSimulated, 0);
  assert.equal(sim.extraCommissionVsReal, 0);
  // Y contra el tope, el faltante es tope - venta real.
  const tope = buildCommissionSimulation({ ...monthly, simulatedSales: 9_000_000 });
  assert.equal(tope.salesToSimulated, tope.sliderMax - monthly.sales);
});

test("simulador: el tope del deslizador alcanza el bracket mas alto del rol", () => {
  const sim = buildCommissionSimulation(monthly);
  // El bracket más alto empieza en 115% -> 115_000 de venta. El tope debe pasarlo.
  assert.ok(sim.sliderMax > 115_000, `sliderMax ${sim.sliderMax} no llega al 115%`);
  const top = buildCommissionSimulation({ ...monthly, simulatedSales: sim.sliderMax });
  assert.equal(top.simulated.percent, 2.29);
});

test("simulador: la venta simulada se acota al rango del deslizador", () => {
  // Por debajo de la venta ya hecha no se puede simular.
  assert.equal(buildCommissionSimulation({ ...monthly, simulatedSales: 10_000 }).simulatedSales, 100_000);
  // Por encima del tope se recorta (p. ej. si la venta real subió tras refrescar).
  const sim = buildCommissionSimulation({ ...monthly, simulatedSales: 9_000_000 });
  assert.equal(sim.simulatedSales, sim.sliderMax);
});

test("simulador: el hueco al siguiente bracket se mide sobre la venta SIMULADA", () => {
  const sim = buildCommissionSimulation({ ...monthly, simulatedSales: 110_000 });
  assert.ok(sim.gap);
  assert.equal(sim.gap!.atTop, false);
  assert.equal(sim.gap!.targetAchievement, 115);
  assert.equal(sim.gap!.salesNeeded, 5_000); // 115_000 - 110_000
});

test("simulador: en el bracket mas alto devuelve atTop", () => {
  const sim = buildCommissionSimulation({ ...monthly, simulatedSales: 130_000 });
  assert.ok(sim.gap?.atTop);
  assert.equal(sim.gap!.currentPercent, 2.29);
});

test("simulador: sin venta ni meta no revienta", () => {
  const sim = buildCommissionSimulation({ sales: 0, goal: 0, minimum: null, rules: advisorRules, role: "ASESOR" });
  assert.equal(sim.real.minimum, 0);
  assert.equal(sim.real.amount, 0);
  assert.equal(sim.simulated.amount, 0);
  assert.equal(sim.gap, null);
  // El deslizador sigue teniendo recorrido, no colapsa a un punto.
  assert.ok(sim.sliderMax > sim.sliderMin);
});

test("simulador: mezclar la venta de un dia con el minimo del mes clava el bracket mas bajo", () => {
  // Regresión: el home pasaba venta y meta DIARIAS con el mínimo MENSUAL.
  const mezclado = buildCommissionSimulation({ ...monthly, sales: 4_500, goal: 5_000 });
  assert.equal(Math.round(mezclado.real.achievement), 5); // 4_500 / 100_000
  assert.equal(mezclado.real.percent, 1.53);
  // Con el mes completo, la misma persona está en 1.91%.
  assert.equal(buildCommissionSimulation(monthly).real.percent, 1.91);
});

const row: KpiRow = {
  userId: "waira",
  date: new Date("2026-07-24T00:00:00.000Z"),
  dailySales: 4_500,
  monthlySales: 100_000,
  dailyGoal: 5_000,
  monthlyGoal: 115_000,
  avgTicket: 1_500,
  upt: 2.4,
  conversion: null,
  traffic: null,
  pieces: 12,
  transactions: 5,
  ranking: 1,
  grossSales: null,
  discountAmount: null,
  discountMargin: null,
  discountLimit: null,
  commissionAmount: 0,
  commissionPercent: 0,
  commissionMinimum: 100_000
};

test("payload de KPI: incluye commissionMinimum", () => {
  // Sin este campo el home deriva el mínimo de la meta y muestra una tasa
  // distinta a la de /kpis para la misma persona.
  assert.equal(toKpiPayload(row).commissionMinimum, 100_000);
});

test("payload de KPI: minimo ausente viaja como null, no como 0", () => {
  // 0 y null no son lo mismo: resolveCommissionMinimum trata ambos como
  // "sin mínimo", pero null deja claro que el RDV no lo trajo.
  assert.equal(toKpiPayload({ ...row, commissionMinimum: null }).commissionMinimum, null);
});

test("payload de KPI: convierte Decimal a number y la fecha a YYYY-MM-DD", () => {
  // Los Decimal de Prisma llegan como objeto con toString().
  const decimal = { toString: () => "123456.78" };
  const payload = toKpiPayload({ ...row, monthlySales: decimal, commissionMinimum: decimal });
  assert.equal(payload.monthlySales, 123_456.78);
  assert.equal(payload.commissionMinimum, 123_456.78);
  assert.equal(payload.date, "2026-07-24");
});
