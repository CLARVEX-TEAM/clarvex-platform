import assert from "node:assert/strict";
import test from "node:test";
import { computeDiscountMargin, normalizeDiscountEntry } from "../lib/discount-capture-entry";

const base = { employeeNumber: "95739", weekNumber: 33, grossSales: 100000, discountAmount: 12000 };

test("calcula el margen y no lo acepta capturado", () => {
  const outcome = normalizeDiscountEntry(base);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.discountMargin, 0.12);
  assert.equal(outcome.value.grossSales, 100000);
});

test("acepta importes con simbolos y separadores", () => {
  const outcome = normalizeDiscountEntry({ ...base, grossSales: "$100,000.00", discountAmount: "12,000" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.discountMargin, 0.12);
});

test("rechaza sin venta bruta", () => {
  // El importador solo guarda filas con venta bruta > 0: sin ella el margen no
  // significa nada y ensuciaria la semana con un 0 % enganoso.
  const outcome = normalizeDiscountEntry({ ...base, grossSales: 0 });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /sin venta bruta/);
});

test("rechaza un descuento mayor que la venta", () => {
  const outcome = normalizeDiscountEntry({ ...base, discountAmount: 150000 });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /supera la venta bruta/);
});

test("rechaza semanas fuera de rango", () => {
  for (const weekNumber of [0, 54, -3, 1.5, "abc"]) {
    assert.equal(normalizeDiscountEntry({ ...base, weekNumber }).ok, false, `deberia rechazar ${weekNumber}`);
  }
});

test("acepta las semanas limite", () => {
  assert.equal(normalizeDiscountEntry({ ...base, weekNumber: 1 }).ok, true);
  assert.equal(normalizeDiscountEntry({ ...base, weekNumber: 53 }).ok, true);
});

test("rechaza negativos", () => {
  assert.equal(normalizeDiscountEntry({ ...base, discountAmount: -1 }).ok, false);
});

test("descuento cero es valido: margen 0", () => {
  const outcome = normalizeDiscountEntry({ ...base, discountAmount: 0 });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.discountMargin, 0);
});

test("computeDiscountMargin protege el divisor cero", () => {
  assert.equal(computeDiscountMargin(0, 500), 0);
});
