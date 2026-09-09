import assert from "node:assert/strict";
import test from "node:test";
import { validateVisionText } from "../lib/pos-vision";
import { discountAsReduction, posCaptureRows, rowProblems, type PosRow } from "../lib/pos-productivity";
import { normalizeKpiEntry } from "../lib/kpi-capture-entry";

/**
 * El dia de TH SAN AGUSTIN del 27 de agosto de 2026, entero y exacto.
 *
 * ⚠️ Es un dia de DEVOLUCION, y por eso tumbaba la captura: una asesora
 * atendio un solo ticket, de devolucion, y eso deja tres columnas en negativo
 * --neto, promedio de unidades y promedio de monto-- ademas de invertir el
 * signo del descuento, que en vez de rebajar suma. El lector devolvia la tabla
 * bien y el esquema la rechazaba, con un mensaje que culpaba a la nitidez de
 * la captura.
 *
 * Las dos filas normales van con el: lo que hacia el fallo caro es que una
 * sola fila detiene el reporte completo.
 */
const RESPUESTA_DEL_LECTOR = JSON.stringify({
  from: "2026-08-27",
  to: "2026-08-27",
  storeNumber: "3029",
  rows: [
    { name: "CASTRO, JAZMIN", tickets: 2, units: 3, unitsReturned: 0, gross: 4997.0, discount: 2199.0, afterDiscount: 2798.0, returns: 0, net: 2798.0, avgUnits: 1.5, avgAmount: 1399.0 },
    { name: "HERNANDEZ, JESUS ADR", tickets: 2, units: 4, unitsReturned: 0, gross: 8196.0, discount: 1519.2, afterDiscount: 6676.8, returns: 0, net: 6676.8, avgUnits: 2.0, avgAmount: 3338.4 },
    { name: "REYES, ITZEL SAIDY", tickets: 1, units: 0, unitsReturned: -1, gross: 0, discount: 679.6, afterDiscount: 679.6, returns: -1699.0, net: -1019.4, avgUnits: -1.0, avgAmount: -1019.4 }
  ],
  /*
   * El pie «Promedio», la media de las tres filas.
   *
   * ⚠️ En un dia de devoluciones el pie tambien sale en NEGATIVO en las
   * columnas que arrastran la devolucion, igual que la fila que la origina.
   * Ponerle suelo aqui rechazaria justo el dia que hay que mirar con mas
   * cuidado, que es el fallo del 27 de agosto de 2026 por el que existe este
   * archivo.
   */
  promedio: {
    tickets: 2, units: 2, gross: 4397.67,
    afterDiscount: 3384.8, net: 2818.47,
    avgUnits: 0.83, avgAmount: 1239.33
  }
});

test("un dia con devolucion pasa el validador", () => {
  const leido = validateVisionText(RESPUESTA_DEL_LECTOR);
  assert.equal(leido.ok, true, leido.ok ? "" : `rechazado: ${leido.reason}`);
});

test("y sale con las tres filas y el neto en rojo", () => {
  const leido = validateVisionText(RESPUESTA_DEL_LECTOR);
  assert.ok(leido.ok);
  assert.equal(leido.value.rows.length, 3);
  assert.equal(leido.value.rows[2].net, -1019.4);
  // Las devoluciones se normalizan a magnitud aunque lleguen en negativo.
  assert.equal(leido.value.rows[2].returns, 1699);
  assert.equal(leido.value.rows[2].unitsReturned, 1);
});

test("el descuento de una devolucion es una REVERSION, no una rebaja", () => {
  const leido = validateVisionText(RESPUESTA_DEL_LECTOR);
  assert.ok(leido.ok);
  // Suma en vez de restar: 0 − (−679.60) = 679.60.
  assert.equal(discountAsReduction(leido.value.rows[2]), -679.6);
  // Y un dia normal sigue siendo una rebaja.
  assert.equal(discountAsReduction(leido.value.rows[0]), 2199);
});

test("las cuentas del reporte cuadran en las tres filas", () => {
  const leido = validateVisionText(RESPUESTA_DEL_LECTOR);
  assert.ok(leido.ok);
  for (const fila of leido.value.rows) {
    assert.deepEqual(rowProblems(fila), [], `${fila.name} no cuadro`);
  }
});

test("el prellenado deja el margen VACIO en la fila de la devolucion", () => {
  const leido = validateVisionText(RESPUESTA_DEL_LECTOR);
  assert.ok(leido.ok);
  const filas = posCaptureRows(leido.value);
  assert.ok(filas.ok, filas.ok ? "" : filas.error);

  // Venta sin IVA, en rojo, con su ticket y cero piezas.
  assert.deepEqual(filas.value[2], {
    name: "REYES, ITZEL SAIDY",
    dailySales: -878.79,
    transactions: 1,
    pieces: 0,
    // El descuento devuelto es de la venta de OTRO dia: dividirlo por el bruto
    // de hoy no da un margen, asi que no se inventa uno.
    grossSales: null,
    discountAmount: null
  });
  // Los dias normales conservan su margen.
  assert.equal(filas.value[0].grossSales, 4997);
  assert.equal(filas.value[0].discountAmount, 2199);
});

test("y esa fila se puede GUARDAR, que es donde acaba", () => {
  const guardada = normalizeKpiEntry({
    employeeNumber: "81893",
    date: "2026-08-27",
    dailyGoal: 0,
    dailySales: -878.79,
    transactions: 1,
    pieces: 0,
    grossSales: null,
    discountAmount: null
  });
  assert.ok(guardada.ok, guardada.ok ? "" : guardada.error);
  assert.equal(guardada.value.dailySales, -878.79);
  assert.equal(guardada.value.grossSales, null);
});

/* ─── que la red siga puesta ──────────────────────────────────────────────── */

test("una magnitud mal leida se sigue deteniendo, con signo o sin el", () => {
  const malo: PosRow = {
    name: "REYES, ITZEL SAIDY",
    tickets: 1, units: 0, unitsReturned: 1,
    gross: 0, discount: 679.7, afterDiscount: 679.6, returns: 1699,
    net: -1019.4, avgUnits: -1, avgAmount: -1019.4
  };
  assert.equal(discountAsReduction(malo), null);
  assert.ok(rowProblems(malo).length > 0);
});

test("un bruto negativo sigue siendo imposible", () => {
  const malo: PosRow = {
    name: "X", tickets: 1, units: 1, unitsReturned: 0,
    gross: -100, discount: 0, afterDiscount: -100, returns: 0,
    net: -100, avgUnits: 1, avgAmount: -100
  };
  assert.ok(rowProblems(malo).some((p) => p.includes("negativas")));
});

test("el rechazo dice QUE campo fallo, no que la foto este borrosa", () => {
  const sinNombre = JSON.stringify({
    from: "2026-08-27", to: "2026-08-27", storeNumber: "3029",
    rows: [{ name: "", tickets: 1, units: 1, gross: 1, discount: 0, afterDiscount: 1, net: 1, avgUnits: 1, avgAmount: 1 }]
  });
  const leido = validateVisionText(sinNombre);
  assert.equal(leido.ok, false);
  assert.ok(!leido.ok && leido.reason.includes("name"), !leido.ok ? leido.reason : "");
});
