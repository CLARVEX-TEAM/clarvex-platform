import assert from "node:assert/strict";
import test from "node:test";
import { parseAmount, parseCuotaJusta, parseDate, weeklyTotal } from "../lib/cuota-justa";

/**
 * Pegado tal como sale de Excel: cada dia ocupa DOS columnas (% e importe) y la
 * fecha solo aparece en la primera de las dos, porque estan combinadas.
 * Numeros reales de la semana 33 de San Agustin.
 */
const PEGADO = [
  "FECHA\t16-ago-26\t\t17-ago-26\t\t18-ago-26\t",
  "DIA\tDOMINGO\t\tLUNES\t\tMARTES\t",
  "MINIMO\t$28,430.95\t\t$9,476.98\t\t$7,581.59\t",
  "META\t$32,695.59\t\t$10,898.53\t\t$8,718.83\t",
  "PUNTO DE VENTA\t\t\t\t\t\t",
  "Itzel\t10%\t$3,269.56\t10%\t$1,089.85\t10%\t$871.88",
  "Adrián\t0%\t$0.00\t15%\t$1,634.78\t15%\t$1,307.82",
  "Waira\t30%\t$9,808.68\t25%\t$2,724.63\t25%\t$2,179.71",
  "Jazmín\t30%\t$9,808.68\t25%\t$2,724.63\t25%\t$2,179.71",
  "Alonso\t30%\t$9,808.68\t25%\t$2,724.63\t25%\t$2,179.71",
  "\t0%\t$0.00\t0%\t$0.00\t0%\t$0.00",
  "TOTAL\t100%\t$32,695.59\t100%\t$10,898.53\t100%\t$8,718.83",
  "PPTO\t$102.00\t\t$102.00\t\t$102.00\t",
  "WHATSAPP\t\t\t\t\t\t",
  "Itzel\t10%\t$10.20\t10%\t$10.20\t10%\t$10.20"
].join("\n");

test("lee las fechas de la semana en orden", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.value.dates, ["2026-08-16", "2026-08-17", "2026-08-18"]);
});

test("toma el importe de la columna siguiente a la fecha", () => {
  // Es la regla entera del formato: la fecha esta en la primera celda del par
  // combinado y el importe en la segunda.
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const itzel = outcome.value.people.find((p) => p.name === "ITZEL");
  assert.ok(itzel);
  assert.deepEqual(itzel.goals, {
    "2026-08-16": 3269.56,
    "2026-08-17": 1089.85,
    "2026-08-18": 871.88
  });
});

test("IGNORA el bloque de WhatsApp", () => {
  // Son ~$102 al dia para toda la tienda; mezclarlo distorsionaria el alcance.
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.people.length, 5);
  const itzel = outcome.value.people.find((p) => p.name === "ITZEL")!;
  assert.equal(itzel.goals["2026-08-16"], 3269.56); // no 3279.76
});

test("corta en la fila TOTAL y no la toma como persona", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.value.people.map((p) => p.name), ["ITZEL", "ADRIAN", "WAIRA", "JAZMIN", "ALONSO"]);
});

test("un dia en cero se conserva: ese dia no le tocaba vender", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const adrian = outcome.value.people.find((p) => p.name === "ADRIAN")!;
  assert.equal(adrian.goals["2026-08-16"], 0);
  assert.equal(adrian.goals["2026-08-17"], 1634.78);
});

test("las filas de reserva sin nombre no entran", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.people.some((p) => p.name === ""), false);
});

test("guarda la meta de tienda de cada dia", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.storeGoals["2026-08-16"], 32695.59);
});

test("avisa cuando el reparto no cuadra con la meta de tienda", () => {
  // Es la senal de que el pegado se quedo corto de filas: sembrar eso dejaria
  // metas mal repartidas sin que nada lo dijera.
  const incompleto = PEGADO.split("\n").filter((line) => !line.startsWith("Waira")).join("\n");
  const outcome = parseCuotaJusta(incompleto);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.ok(outcome.value.warnings.some((w) => w.includes("2026-08-16")));
});

test("sin descuadre no hay avisos", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(outcome.value.warnings, []);
});

test("el total semanal por persona se calcula", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const waira = outcome.value.people.find((p) => p.name === "WAIRA")!;
  assert.equal(weeklyTotal(waira), 14713.02);
});

test("sin fila FECHA no se adivina nada", () => {
  const outcome = parseCuotaJusta("Itzel\t10%\t$3,269.56");
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /FECHA/);
});

test("un pegado vacio se rechaza", () => {
  assert.equal(parseCuotaJusta("   \n  \n").ok, false);
});

test("una persona repetida se rechaza en vez de pisar su meta", () => {
  const doble = PEGADO.replace("Alonso\t", "Waira\t");
  const outcome = parseCuotaJusta(doble);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /dos veces/);
});

test("una meta negativa se rechaza", () => {
  const malo = PEGADO.replace("$3,269.56", "-$500.00");
  const outcome = parseCuotaJusta(malo);
  assert.equal(outcome.ok, false);
});

test("reconoce los formatos de fecha que usa Excel", () => {
  assert.equal(parseDate("16-ago-26"), "2026-08-16");
  assert.equal(parseDate("16/08/2026"), "2026-08-16");
  assert.equal(parseDate("2026-08-16"), "2026-08-16");
  assert.equal(parseDate("16-AGO-2026"), "2026-08-16");
  assert.equal(parseDate("31-feb-26"), null);
  assert.equal(parseDate("DOMINGO"), null);
  assert.equal(parseDate(""), null);
});

test("reconoce los importes con formato de moneda", () => {
  assert.equal(parseAmount("$3,269.56"), 3269.56);
  assert.equal(parseAmount("3269.56"), 3269.56);
  assert.equal(parseAmount("$ 1,089.85"), 1089.85);
  assert.equal(parseAmount("$0.00"), 0);
  // El porcentaje es la OTRA columna del dia: nunca es el importe.
  assert.equal(parseAmount("10%"), null);
  assert.equal(parseAmount("Itzel"), null);
  assert.equal(parseAmount(""), null);
});

test("los acentos no parten el nombre", () => {
  const outcome = parseCuotaJusta(PEGADO);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.ok(outcome.value.people.some((p) => p.name === "JAZMIN"));
  assert.ok(outcome.value.people.some((p) => p.name === "ADRIAN"));
});

test("acepta el pegado con saltos de linea de Windows", () => {
  const outcome = parseCuotaJusta(PEGADO.replace(/\n/g, "\r\n"));
  assert.equal(outcome.ok, true);
});
