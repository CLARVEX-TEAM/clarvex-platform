import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRICE_PER_USER_MXN, extendSubscription, monthlyAmount, pricePerUser, subscriptionState } from "../lib/billing";

test("precio por usuario: usa el de la tienda si existe, si no el default $80", () => {
  assert.equal(pricePerUser(120), 120);
  assert.equal(pricePerUser(null), DEFAULT_PRICE_PER_USER_MXN);
  assert.equal(pricePerUser(0), DEFAULT_PRICE_PER_USER_MXN);
});

test("mensualidad: usuarios activos × precio por usuario", () => {
  assert.equal(monthlyAmount(5, null), 400);   // 5 × 80
  assert.equal(monthlyAmount(8, null), 640);   // 8 × 80
  assert.equal(monthlyAmount(3, 100), 300);    // precio propio 100
  assert.equal(monthlyAmount(0, null), 80);    // mínimo 1 usuario
});

test("extender: vencida o sin pago arranca desde hoy + 1 mes", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");
  assert.equal(extendSubscription(null, now).toISOString(), "2026-08-10T12:00:00.000Z");
  const expired = new Date("2026-06-01T00:00:00.000Z");
  assert.equal(extendSubscription(expired, now).toISOString(), "2026-08-10T12:00:00.000Z");
});

test("extender: pago anticipado acumula sobre la fecha vigente", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");
  const vigente = new Date("2026-07-25T00:00:00.000Z");
  assert.equal(extendSubscription(vigente, now).toISOString(), "2026-08-25T00:00:00.000Z");
});

test("estado: exenta, activa, por vencer, vencida, sin pago", () => {
  const now = new Date("2026-07-10T00:00:00.000Z");
  assert.equal(subscriptionState({ billingExempt: true, subscriptionPaidUntil: null, now }).state, "exenta");
  assert.equal(subscriptionState({ billingExempt: false, subscriptionPaidUntil: null, now }).state, "sin_pago");
  assert.equal(subscriptionState({ billingExempt: false, subscriptionPaidUntil: new Date("2026-08-10T00:00:00.000Z"), now }).state, "activa");
  assert.equal(subscriptionState({ billingExempt: false, subscriptionPaidUntil: new Date("2026-07-13T00:00:00.000Z"), now }).state, "por_vencer");
  assert.equal(subscriptionState({ billingExempt: false, subscriptionPaidUntil: new Date("2026-07-01T00:00:00.000Z"), now }).state, "vencida");
});
