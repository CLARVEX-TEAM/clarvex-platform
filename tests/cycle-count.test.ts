import assert from "node:assert/strict";
import test from "node:test";
import { entryCountsDone, entryDifference, entryNeedsRecount, entryReal, entryResolved, serializeEntry, slotFilled, zoneProgress } from "../lib/cycle-count";

test("Real replica la regla de la mesa de control", () => {
  // Sin 2do conteo → vale el 1ro.
  assert.equal(entryReal({ count1: 100, count2: null, count3: null }), 100);
  // 2do igual al 1ro (diferencia 0) → vale el 1ro.
  assert.equal(entryReal({ count1: 100, count2: 100, count3: null }), 100);
  // Con diferencia → vale el 3er conteo.
  assert.equal(entryReal({ count1: 100, count2: 99, count3: 99 }), 99);
  // Con diferencia y sin 3ro aún → provisionalmente el 2do.
  assert.equal(entryReal({ count1: 100, count2: 99, count3: null }), 99);
  // Sin contar → null.
  assert.equal(entryReal({ count1: null, count2: null, count3: null }), null);
});

test("diferencia y marbetes por recontar", () => {
  assert.equal(entryDifference({ count1: 100, count2: 99, count3: null }), -1);
  assert.equal(entryDifference({ count1: 100, count2: null, count3: null }), null);
  assert.equal(entryNeedsRecount({ count1: 100, count2: 99, count3: null }), true);
  assert.equal(entryNeedsRecount({ count1: 100, count2: 99, count3: 99 }), false);
  assert.equal(entryNeedsRecount({ count1: 100, count2: 100, count3: null }), false);
});

test("conteo CIEGO: al asesor se le ocultan las piezas pero se le manda el avance", () => {
  const raw = {
    tagId: "t1",
    count1: 100, count1ByName: "Jazmín", count1At: "2026-07-21T10:00:00Z",
    count2: null, count2ByName: null,
    count3: null, count3ByName: null
  };
  // Gerencia ve las piezas.
  const forManager = serializeEntry(raw, true);
  assert.equal(forManager.count1, 100);
  // Asesor: NO ve las piezas de Jazmín, pero sí quién contó y el avance.
  const forAdvisor = serializeEntry(raw, false);
  assert.equal(forAdvisor.count1, null);
  assert.equal(forAdvisor.count2, null);
  assert.equal(forAdvisor.count1ByName, "Jazmín");   // sabe quién hizo el 1ro
  assert.deepEqual(forAdvisor.slotsFilled, [true, false, false]);
  // Las funciones derivadas siguen funcionando con las piezas ocultas.
  assert.equal(entryCountsDone(forAdvisor), 1);       // Alonso sabe que va el 2do
  assert.equal(slotFilled(forAdvisor, 1), true);
  assert.equal(slotFilled(forAdvisor, 2), false);
  assert.equal(entryResolved(forAdvisor), true);      // 1 conteo → resuelto provisional
});

test("conteo ciego: needsRecount y resolved se conservan sin revelar piezas", () => {
  // Diferencia entre 1ro y 2do: necesita 3er conteo. El asesor lo sabe, sin ver los números.
  const diff = serializeEntry({
    tagId: "t2",
    count1: 100, count1ByName: "Jazmín", count1At: null,
    count2: 90, count2ByName: "Alonso",
    count3: null, count3ByName: null
  }, false);
  assert.equal(diff.count1, null);
  assert.equal(diff.count2, null);
  assert.equal(entryNeedsRecount(diff), true);
  assert.equal(entryCountsDone(diff), 2);
});

test("avance por zona: contados, piezas y pendientes", () => {
  const tags = [
    { id: "a", number: 1, zone: "PISO" as const },
    { id: "b", number: 2, zone: "PISO" as const },
    { id: "c", number: 3, zone: "BODEGA" as const }
  ];
  const entries = new Map([
    ["a", { count1: 21, count2: null, count3: null }],
    ["c", { count1: 50, count2: 48, count3: null }]
  ]);
  const piso = zoneProgress("PISO", tags, entries);
  assert.equal(piso.total, 2);
  assert.equal(piso.counted, 1);
  assert.equal(piso.pieces, 21);
  assert.deepEqual(piso.pendingNumbers, [2]);
  const bodega = zoneProgress("BODEGA", tags, entries);
  assert.equal(bodega.counted, 1);
  assert.equal(bodega.pieces, 48);
  assert.equal(bodega.discrepancies, 1);
});
