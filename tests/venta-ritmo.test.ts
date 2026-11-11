import assert from "node:assert/strict";
import test from "node:test";
import { contraElRitmo, ritmoEsperado } from "../lib/venta-ritmo";

test("antes de abrir se espera 0 y al cerrar el 100 %", () => {
  assert.equal(ritmoEsperado(9 * 60), 0);
  assert.equal(ritmoEsperado(11 * 60), 0);
  assert.equal(ritmoEsperado(21 * 60), 1);
  assert.equal(ritmoEsperado(23 * 60), 1);
});

test("la curva solo sube y el pico va en la tarde", () => {
  let antes = 0;
  for (let m = 11 * 60; m <= 21 * 60; m += 15) {
    const r = ritmoEsperado(m);
    assert.ok(r >= antes, `baja a las ${m}`);
    antes = r;
  }
  // A las 4 pm (mitad del horario) se espera MENOS de la mitad: lo fuerte es de 5 a 8.
  assert.ok(ritmoEsperado(16 * 60) < 0.5);
  assert.equal(ritmoEsperado(17 * 60 + 30), 0.535);
});

test("arriba o abajo del ritmo, y sin meta no se juzga", () => {
  assert.equal(contraElRitmo(12000, 20000, 17 * 60 + 30), 1300);
  assert.equal(contraElRitmo(8000, 20000, 17 * 60 + 30), -2700);
  assert.equal(contraElRitmo(5000, 0, 17 * 60), null);
});
