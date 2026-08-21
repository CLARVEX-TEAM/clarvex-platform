import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAchievement,
  computeAvgTicket,
  computeUpt,
  normalizeKpiEntry,
  normalizeTrafficEntry,
  computeConversion
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

test("la VENTA sí puede ser negativa: una devolución sin venta que la compense", () => {
  // Pasó el 20 de agosto de 2026: una clienta devolvió y no se recuperó la
  // venta, así que el día de esa persona cerró en rojo. Se resta de su
  // acumulado y del total de la tienda, que es lo que de verdad ocurrió.
  const outcome = normalizeKpiEntry({ ...base, dailySales: -1031, transactions: 1, pieces: 1 });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.dailySales, -1031);
});

test("piezas, tickets y meta siguen sin poder ser negativos", () => {
  // Las piezas de `Kpi` son BRUTAS: la devolución entra al kardex como su
  // propio movimiento. Una pieza negativa aquí la regresaría al inventario dos
  // veces, y el descuadre solo aparecería en el conteo físico.
  assert.equal(normalizeKpiEntry({ ...base, pieces: -3 }).ok, false);
  assert.equal(normalizeKpiEntry({ ...base, transactions: -1 }).ok, false);
  assert.equal(normalizeKpiEntry({ ...base, dailyGoal: -100 }).ok, false);
});

test("el tope de captura también aplica a las ventas negativas", () => {
  // Un cero de más al capturar en rojo es tan error como en verde.
  const outcome = normalizeKpiEntry({ ...base, dailySales: -99_000_000 });
  assert.equal(outcome.ok, false);
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

test("el trafico acepta una fecha y un numero", () => {
  const outcome = normalizeTrafficEntry({ date: "2026-08-12", value: "1,250" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.value, 1250);
  assert.equal(outcome.value.date.toISOString(), "2026-08-12T00:00:00.000Z");
});

test("el trafico rechaza negativos y cifras absurdas", () => {
  assert.equal(normalizeTrafficEntry({ date: "2026-08-12", value: -5 }).ok, false);
  assert.equal(normalizeTrafficEntry({ date: "2026-08-12", value: 999999 }).ok, false);
});

test("el trafico rechaza fechas invalidas", () => {
  assert.equal(normalizeTrafficEntry({ date: "12-08-2026", value: 100 }).ok, false);
  assert.equal(normalizeTrafficEntry({ date: "2026-02-31", value: 100 }).ok, false);
});

test("la conversion es tickets sobre trafico, en porcentaje", () => {
  assert.equal(computeConversion(25, 500), 5);
});

test("sin trafico la conversion es null, no cero", () => {
  // Kpi.conversion SI es nulable. Sin visitantes la conversion no es 0 %: es
  // desconocida. Un 0 diria "entro gente y no compro nadie", que es otra cosa.
  assert.equal(computeConversion(10, 0), null);
});

/* ─── Margen del dia (bruto y descuento del reporte del POS) ─────────────── */

test("el margen es opcional: sin el, la fila no lo toca", () => {
  const outcome = normalizeKpiEntry({ employeeNumber: "1", date: "2026-08-17", dailySales: 100, transactions: 1, pieces: 1 });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.grossSales, null);
  assert.equal(outcome.value.discountAmount, null);
});

test("bruto y descuento van juntos o no van", () => {
  // Con uno solo no hay margen que calcular, y guardar medio dato es peor que
  // no guardar ninguno: parece capturado.
  assert.equal(normalizeKpiEntry({ employeeNumber: "1", date: "2026-08-17", grossSales: 6396 }).ok, false);
  assert.equal(normalizeKpiEntry({ employeeNumber: "1", date: "2026-08-17", discountAmount: 1558.8 }).ok, false);
});

test("acepta el margen real del 17 de agosto", () => {
  const outcome = normalizeKpiEntry({
    employeeNumber: "96383", date: "2026-08-17",
    dailySales: 4170, transactions: 3, pieces: 4,
    grossSales: 6396, discountAmount: 1558.8
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.grossSales, 6396);
  assert.equal(outcome.value.discountAmount, 1558.8);
});

test("un descuento mayor que la venta bruta se rechaza", () => {
  // No existe: el descuento sale de la bruta. El margen pasaria del 100%, y el
  // margen es un TECHO — un 120% se leeria como un descalabro que no paso.
  const outcome = normalizeKpiEntry({
    employeeNumber: "1", date: "2026-08-17", grossSales: 1000, discountAmount: 1200
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /mayor que la venta bruta/);
});

test("un descuento negativo se rechaza", () => {
  // En el reporte del POS viene con signo menos; se manda en positivo.
  assert.equal(normalizeKpiEntry({ employeeNumber: "1", date: "2026-08-17", grossSales: 1000, discountAmount: -200 }).ok, false);
});
