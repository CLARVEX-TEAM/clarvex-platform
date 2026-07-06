import assert from "node:assert/strict";
import test from "node:test";
import { entryDifference, entryNeedsRecount, entryReal, zoneProgress } from "../lib/cycle-count";

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
