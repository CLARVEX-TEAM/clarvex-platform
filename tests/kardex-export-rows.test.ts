import assert from "node:assert/strict";
import test from "node:test";
import { buildSheetRows, exportTheoretical, type ExportMovement } from "../lib/kardex-export-rows";

const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

const mov = (over: Partial<ExportMovement> & Pick<ExportMovement, "type" | "quantity">): ExportMovement => ({
  date: dia("2026-02-19"),
  reference: null,
  document: null,
  delivery: null,
  counterpart: null,
  counterpartCode: null,
  surplus: null,
  missing: null,
  note: null,
  createdBy: null,
  ...over
});

test("la recepcion va con sus ocho columnas en orden", () => {
  const { rows } = buildSheetRows(
    [
      mov({
        type: "RECEPCION",
        quantity: 4,
        reference: "K10170230",
        delivery: "81717606",
        document: "M0030013372355",
        createdBy: "ADRIAN",
        surplus: 0,
        missing: 1
      })
    ],
    []
  );
  assert.deepEqual(rows.recepcion, [
    [dia("2026-02-19"), "K10170230", 4, "81717606", "M0030013372355", "ADRIAN", 0, 1]
  ]);
});

test("el traspaso enviado deja hueco en SMI, que no se captura", () => {
  // La columna existe en el formato de la tienda y va vacia; si se omitiera, el
  // destino se escribiria en la columna equivocada.
  const { rows } = buildSheetRows(
    [mov({ type: "TRANSFERENCIA_SALIDA", quantity: 30, reference: "1699795", counterpart: "O. MTY", counterpartCode: "03009", createdBy: "ESTAFETA" })],
    []
  );
  assert.deepEqual(rows.enviadas, [[dia("2026-02-19"), "1699795", 30, null, "03009 O. MTY", "ESTAFETA"]]);
});

test("el APTO se antepone al destino", () => {
  // Es lo unico que distingue las dos tiendas de Cuernavaca al leer el archivo.
  const { rows } = buildSheetRows(
    [mov({ type: "TRANSFERENCIA_ENTRADA", quantity: 16, counterpart: "CUERNAVACA", counterpartCode: "03049" })],
    []
  );
  assert.equal(rows.recibidas[0][3], "03049 CUERNAVACA");
});

test("sin APTO se escribe solo la etiqueta", () => {
  const { rows } = buildSheetRows([mov({ type: "TRANSFERENCIA_ENTRADA", quantity: 2, counterpart: "PROVEEDOR" })], []);
  assert.equal(rows.recibidas[0][3], "PROVEEDOR");
});

test("las devoluciones NO son hoja: son columna de Ventas", () => {
  const { rows, totals } = buildSheetRows(
    [
      mov({ type: "DEVOLUCION_CLIENTE", quantity: 1, date: dia("2026-02-19") }),
      mov({ type: "DEVOLUCION_CLIENTE", quantity: 4, date: dia("2026-02-21") })
    ],
    [
      { date: dia("2026-02-19"), pieces: 37 },
      { date: dia("2026-02-20"), pieces: 34 },
      { date: dia("2026-02-21"), pieces: 101 }
    ]
  );
  assert.deepEqual(rows.ventas, [
    [dia("2026-02-19"), 37, 1],
    [dia("2026-02-20"), 34, 0],
    [dia("2026-02-21"), 101, 4]
  ]);
  assert.equal(totals.soldPieces, 172);
  assert.equal(totals.customerReturns, 5);
  assert.equal(totals.netSales, 167);
});

test("varias devoluciones del mismo dia se suman en una sola fila", () => {
  const { rows } = buildSheetRows(
    [
      mov({ type: "DEVOLUCION_CLIENTE", quantity: 1 }),
      mov({ type: "DEVOLUCION_CLIENTE", quantity: 2 })
    ],
    [{ date: dia("2026-02-19"), pieces: 10 }]
  );
  assert.deepEqual(rows.ventas, [[dia("2026-02-19"), 10, 3]]);
});

test("un dia con devolucion pero sin venta tambien aparece", () => {
  // Si no, esa devolucion desaparece de la hoja aunque este sumada en el total.
  const { rows } = buildSheetRows([mov({ type: "DEVOLUCION_CLIENTE", quantity: 2, date: dia("2026-03-01") })], []);
  assert.deepEqual(rows.ventas, [[dia("2026-03-01"), 0, 2]]);
});

test("las ventas salen ordenadas por fecha", () => {
  const { rows } = buildSheetRows(
    [],
    [
      { date: dia("2026-03-05"), pieces: 5 },
      { date: dia("2026-02-19"), pieces: 1 },
      { date: dia("2026-02-28"), pieces: 3 }
    ]
  );
  assert.deepEqual(rows.ventas.map((r) => r[0]), [dia("2026-02-19"), dia("2026-02-28"), dia("2026-03-05")]);
});

test("reproduce los totales de la 1ra ronda de TOMMY SAN AGUSTIN", () => {
  const { totals } = buildSheetRows(
    [
      mov({ type: "RECEPCION", quantity: 8220, surplus: 6, missing: 10 }),
      mov({ type: "TRANSFERENCIA_ENTRADA", quantity: 23 }),
      mov({ type: "TRANSFERENCIA_SALIDA", quantity: 2039 }),
      mov({ type: "DEVOLUCION_CLIENTE", quantity: 97 })
    ],
    [{ date: dia("2026-02-19"), pieces: 5372 }]
  );
  assert.equal(totals.netSales, 5275);
  assert.equal(totals.totalIn, 8243);
  assert.equal(totals.totalOut, 7314);
  assert.equal(totals.surplus, 6);
  assert.equal(totals.missing, 10);
  assert.equal(exportTheoretical(6430, totals), 7359);
});

test("los ajustes van a su propia hoja y entran al teorico", () => {
  // El formato de la tienda no los contempla; omitirlos dejaria el teorico mal.
  const { rows, totals } = buildSheetRows(
    [
      mov({ type: "AJUSTE_NEGATIVO", quantity: 75, note: "Merma autorizada" }),
      mov({ type: "AJUSTE_POSITIVO", quantity: 10, note: "Aparecio en bodega" })
    ],
    []
  );
  assert.equal(rows.ajustes.length, 2);
  assert.equal(rows.ajustes[0][1], "En contra");
  assert.equal(rows.ajustes[1][1], "A favor");
  assert.equal(totals.adjustments, -65);
  assert.equal(exportTheoretical(1000, totals), 935);
});

test("sin ajustes el teorico es la resta del formato", () => {
  const { totals } = buildSheetRows([mov({ type: "RECEPCION", quantity: 100 })], [{ date: dia("2026-02-19"), pieces: 20 }]);
  assert.equal(exportTheoretical(500, totals), 500 + 100 - 20);
});

test("SFS lleva pedido, folio y comentario", () => {
  const { rows, totals } = buildSheetRows(
    [mov({ type: "SFS", quantity: 3, reference: "PED-882", document: "F-11", note: "urgente" })],
    []
  );
  assert.deepEqual(rows.sfs, [[dia("2026-02-19"), "PED-882", 3, "F-11", "urgente"]]);
  assert.equal(totals.shipFromStore, 3);
  assert.equal(totals.shipFromStoreCount, 1);
});

test("cuenta cajas y folios como el formato", () => {
  const { totals } = buildSheetRows(
    [
      mov({ type: "RECEPCION", quantity: 4 }),
      mov({ type: "RECEPCION", quantity: 13 }),
      mov({ type: "TRANSFERENCIA_SALIDA", quantity: 1 })
    ],
    []
  );
  assert.equal(totals.receivedBoxes, 2);
  assert.equal(totals.received, 17);
  assert.equal(totals.transferredOutCount, 1);
});

test("los movimientos salen ordenados por fecha dentro de cada hoja", () => {
  const { rows } = buildSheetRows(
    [
      mov({ type: "RECEPCION", quantity: 1, date: dia("2026-03-10"), reference: "B" }),
      mov({ type: "RECEPCION", quantity: 1, date: dia("2026-02-19"), reference: "A" })
    ],
    []
  );
  assert.deepEqual(rows.recepcion.map((r) => r[1]), ["A", "B"]);
});

test("dentro del mismo dia manda el orden de captura", () => {
  // El estado del kardex llega del mas reciente al mas antiguo, que es lo que
  // quiere la pantalla. Sin desempatar por createdAt, dos recepciones del mismo
  // dia salian invertidas en el archivo respecto a como se capturaron.
  const { rows } = buildSheetRows(
    [
      mov({ type: "RECEPCION", quantity: 1, reference: "SEGUNDA", createdAt: new Date("2026-02-19T18:00:00Z") }),
      mov({ type: "RECEPCION", quantity: 1, reference: "PRIMERA", createdAt: new Date("2026-02-19T09:00:00Z") })
    ],
    []
  );
  assert.deepEqual(rows.recepcion.map((r) => r[1]), ["PRIMERA", "SEGUNDA"]);
});
