import assert from "node:assert/strict";
import test from "node:test";
import { calculateDiscountMargin } from "../lib/pos-discounts";

test("calcula el margen de descuento POS como porcentaje", () => {
  assert.equal(calculateDiscountMargin(250, 5_000), 5);
  assert.equal(calculateDiscountMargin(333.33, 10_000), 3.33);
});

test("no calcula margen sin venta bruta valida", () => {
  assert.equal(calculateDiscountMargin(100, 0), null);
  assert.equal(calculateDiscountMargin(100, Number.NaN), null);
});
