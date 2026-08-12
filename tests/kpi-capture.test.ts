import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAchievement,
  computeAvgTicket,
  computeUpt,
  normalizeKpiEntry
} from "../lib/kpi-capture-entry";

const base = {
  employeeNumber: "95739",
  date: "2026-08-12",
  dailyGoal: 12000,
  dailySales: 15000,
  transactions: 10,
  pieces: 25
};

test("acepta una fila normal y ancla la fecha a medianoche UTC", () => {
  const outcome = normalizeKpiEntry(base);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.date.toISOString(), "2026-08-12T00:00:00.000Z");
  assert.equal(outcome.value.dailySales, 15000);
});

test("acepta importes con separadores y simbolo de moneda", () => {
  // Capturando a mano se pega tal cual del punto de venta.
  const outcome = normalizeKpiEntry({ ...base, dailySales: "$15,000.50" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.dailySales, 15000.5);
});

test("una celda vacia cuenta como cero, no como error", () => {
  const outcome = normalizeKpiEntry({ ...base, dailySales: "", transactions: 0, pieces: 0 });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.dailySales, 0);
});

test("rechaza mas tickets que piezas", () => {
  // Cada ticket lleva al menos una pieza: casi siempre son columnas invertidas.
  const outcome = normalizeKpiEntry({ ...base, transactions: 25, pieces: 10 });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /invirtieron/);
});

test("rechaza venta con cero tickets", () => {
  const outcome = normalizeKpiEntry({ ...base, dailySales: 5000, transactions: 0 });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /cero tickets/);
});

test("rechaza negativos", () => {
  assert.equal(normalizeKpiEntry({ ...base, dailySales: -1 }).ok, false);
  assert.equal(normalizeKpiEntry({ ...base, pieces: -3 }).ok, false);
});

test("rechaza un importe absurdo", () => {
  // Un cero de mas al capturar no debe entrar en silencio y falsear el mes.
  const outcome = normalizeKpiEntry({ ...base, dailySales: 99_000_000 });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /error de captura/);
});

test("rechaza texto que no es numero", () => {
  assert.equal(normalizeKpiEntry({ ...base, transactions: "diez" }).ok, false);
});

test("rechaza un dia que no existe", () => {
  assert.equal(normalizeKpiEntry({ ...base, date: "2026-02-31" }).ok, false);
});

test("los derivados salen de las formulas del RDV", () => {
  assert.equal(computeUpt(25, 10), 2.5);
  assert.equal(computeAvgTicket(15000, 10), 1500);
  assert.equal(computeAchievement(15000, 12000), 125);
});

test("un divisor en cero guarda 0, igual que el importador", () => {
  // Kpi.upt y Kpi.avgTicket son NO nulables, y ratio() del importador devuelve 0.
  // Una fila capturada tiene que ser indistinguible de una importada.
  // Mostrar «—» en vez de 0 es cosa de la capa de vista, no del dato guardado.
  assert.equal(computeUpt(0, 0), 0);
  assert.equal(computeAvgTicket(0, 0), 0);
});

test("alcance con meta cero es 0, no infinito", () => {
  assert.equal(computeAchievement(5000, 0), 0);
});

test("una fila sin cifras es valida: cuenta como dia sin venta", () => {
  // Llega asi cuando nadie toco la celda. Exigir ceros explicitos obligaria a
  // capturar "no vendio" a mano en cada dia de descanso.
  const outcome = normalizeKpiEntry({ employeeNumber: "95739", date: "2026-08-12" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.dailySales, 0);
  assert.equal(outcome.value.transactions, 0);
});
