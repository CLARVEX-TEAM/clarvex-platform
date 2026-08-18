import assert from "node:assert/strict";
import test from "node:test";
import { entryCountsDone, entryDifference, entryNeedsRecount, entryReal, entryResolved, nextFreeTagNumber, serializeEntry, slotFilled, zoneProgress } from "../lib/cycle-count";

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

test("conteo CIEGO: el asesor NO ve el conteo de otro, pero sí el avance", () => {
  const raw = {
    tagId: "t1",
    count1: 100, count1ByName: "Jazmín", count1At: "2026-07-21T10:00:00Z", count1ById: "u-jazmin",
    count2: null, count2ByName: null, count2ById: null,
    count3: null, count3ByName: null, count3ById: null
  };
  // Gerencia ve las piezas.
  assert.equal(serializeEntry(raw, true, "u-gerente").count1, 100);
  // Alonso (otro asesor) NO ve las piezas de Jazmín, pero sí quién contó y el avance.
  const forAlonso = serializeEntry(raw, false, "u-alonso");
  assert.equal(forAlonso.count1, null);
  assert.equal(forAlonso.count1ByName, "Jazmín");   // sabe quién hizo el 1ro
  assert.deepEqual(forAlonso.slotsFilled, [true, false, false]);
  assert.equal(entryCountsDone(forAlonso), 1);       // Alonso sabe que va el 2do
  assert.equal(slotFilled(forAlonso, 2), false);
  assert.equal(entryResolved(forAlonso), true);
});

test("conteo CIEGO: cada quien SÍ ve SU propio conteo", () => {
  const raw = {
    tagId: "t2",
    count1: 100, count1ByName: "Jazmín", count1At: null, count1ById: "u-jazmin",
    count2: 90, count2ByName: "Alonso", count2ById: "u-alonso",
    count3: null, count3ByName: null, count3ById: null
  };
  // Jazmín ve su 1er conteo (100) pero NO el 2do de Alonso.
  const forJazmin = serializeEntry(raw, false, "u-jazmin");
  assert.equal(forJazmin.count1, 100);
  assert.equal(forJazmin.count2, null);
  // Alonso ve su 2do conteo (90) pero NO el 1ro de Jazmín.
  const forAlonso = serializeEntry(raw, false, "u-alonso");
  assert.equal(forAlonso.count1, null);
  assert.equal(forAlonso.count2, 90);
  // El avance derivado (needsRecount) se conserva para ambos.
  assert.equal(entryNeedsRecount(forAlonso), true);
  assert.equal(entryCountsDone(forAlonso), 2);
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

test("el siguiente marbete libre mira TODA la tienda, no solo una zona", () => {
  // El numero es unico por tienda (@@unique([storeId, number])). Si piso llega
  // al 120, el marbete nuevo de bodega es el 121: proponer un 61 chocaria con
  // el indice y el alta fallaria sin que se entienda por que.
  assert.equal(nextFreeTagNumber([1, 2, 3, 60, 120]), 121);
});

test("una tienda sin marbetes empieza en 1", () => {
  assert.equal(nextFreeTagNumber([]), 1);
});

test("los huecos no se reciclan", () => {
  // Reusar un hueco le daria a un mueble nuevo el numero de una etiqueta vieja
  // que quiza sigue pegada en otro lado.
  assert.equal(nextFreeTagNumber([1, 2, 7]), 8);
});
