import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBounce, type Bounces } from "../lib/session-loop";

/*
 * El detector existe porque el bucle no produce ningún error que capturar: está
 * hecho de un 401 que el código maneja y un 307 que el middleware emite a
 * propósito. Todo «funciona»; simplemente la persona no puede entrar a su
 * cuenta, y Sentry no tiene nada que reportar.
 *
 * Se prueba la DECISIÓN, no el envío. Las tres líneas que llaman a Sentry no
 * tienen lógica; lo que puede volver inútil al detector es avisar de más (nadie
 * vuelve a abrir la alerta) o de menos (no avisa cuando toca).
 */

const T0 = 1_700_000_000_000;

test("un login normal no avisa", () => {
  // Quien inicia sesión pasa UNA vez por aquí.
  const { bounces, report } = evaluateBounce(null, T0, false);
  assert.equal(bounces.count, 1);
  assert.equal(report, false);
});

test("dos vueltas tampoco: puede ser una sesión que acaba de caducar", () => {
  const first = evaluateBounce(null, T0, false);
  const second = evaluateBounce(first.bounces, T0 + 400, false);
  assert.equal(second.bounces.count, 2);
  assert.equal(second.report, false);
});

test("a la tercera avisa", () => {
  const a = evaluateBounce(null, T0, false);
  const b = evaluateBounce(a.bounces, T0 + 400, false);
  const c = evaluateBounce(b.bounces, T0 + 800, false);
  assert.equal(c.bounces.count, 3);
  assert.equal(c.report, true);
});

test("avisa UNA sola vez aunque el bucle siga girando", () => {
  const previous: Bounces = { count: 9, first: T0 };
  // El bucle da vueltas en segundos: sin este freno llenaría Sentry y costaría
  // dinero por un solo incidente.
  assert.equal(evaluateBounce(previous, T0 + 1000, true).report, false);
});

test("vueltas separadas en el tiempo NO son un bucle", () => {
  const previous: Bounces = { count: 2, first: T0 };
  // Dos caducidades sueltas a lo largo del día no pueden acabar disparando una
  // alerta falsa: pasada la ventana, la cuenta arranca de cero.
  const later = evaluateBounce(previous, T0 + 31_000, false);
  assert.equal(later.bounces.count, 1);
  assert.equal(later.report, false);
});

test("la ventana se mide desde la PRIMERA vuelta, no desde la última", () => {
  // Si se reiniciara con cada vuelta, un bucle lento nunca cumpliría la ventana
  // y jamás avisaría.
  const a = evaluateBounce(null, T0, false);
  const b = evaluateBounce(a.bounces, T0 + 20_000, false);
  assert.equal(b.bounces.first, T0);
});
