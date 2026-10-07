import assert from "node:assert/strict";
import test from "node:test";
import { entryHasMismatch, entryMismatch } from "../lib/cycle-count";

const entry = (c1: number | null, c2: number | null, c3: number | null) => ({
  count1: c1,
  count2: c2,
  count3: c3
});

test("sin tercer conteo no se señala a nadie", () => {
  assert.equal(entryMismatch(entry(37, null, null)), null);
  // Hay diferencia pero todavía falta el tercero: eso ya lo avisa
  // `entryNeedsRecount`, y aquí no hay forma de saber cuál está mal.
  assert.equal(entryMismatch(entry(37, 38, null)), null);
});

test("si el 1ro y el 2do cuadran no hay nada que corregir", () => {
  assert.equal(entryMismatch(entry(37, 37, null)), null);
  // Un tercer conteo innecesario tampoco inventa un problema.
  assert.equal(entryMismatch(entry(37, 37, 37)), null);
});

test("el tercero confirma al primero: el que está mal es el SEGUNDO", () => {
  assert.deepEqual(entryMismatch(entry(37, 38, 37)), {
    kind: "corregir",
    slot: 2,
    captured: 38,
    correct: 37
  });
});

test("el tercero confirma al segundo: el que está mal es el PRIMERO", () => {
  // Caso real del marbete 2 del 6 de octubre de 2026.
  assert.deepEqual(entryMismatch(entry(23, 24, 24)), {
    kind: "corregir",
    slot: 1,
    captured: 23,
    correct: 24
  });
});

test("tres números distintos: no hay mayoría, no se elige culpable", () => {
  const resultado = entryMismatch(entry(37, 38, 40));
  assert.equal(resultado?.kind, "sin-mayoria");
  assert.deepEqual(resultado?.kind === "sin-mayoria" ? resultado.values : null, [37, 38, 40]);
});

test("en conteo ciego la bandera manda, porque las piezas vienen ocultas", () => {
  // El asesor recibe las piezas en null; sin la bandera derivada no podría
  // saber que el marbete arrastra un error.
  const ciego = { count1: null, count2: null, count3: null, hasMismatch: true };
  assert.equal(entryMismatch(ciego), null);
  assert.equal(entryHasMismatch(ciego), true);
  assert.equal(entryHasMismatch({ count1: null, count2: null, count3: null, hasMismatch: false }), false);
});

test("con piezas visibles la bandera se deriva sola", () => {
  assert.equal(entryHasMismatch(entry(23, 24, 24)), true);
  assert.equal(entryHasMismatch(entry(24, 24, null)), false);
});
