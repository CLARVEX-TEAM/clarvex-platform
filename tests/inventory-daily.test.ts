import assert from "node:assert/strict";
import test from "node:test";
import { buildInventoryDaily, dailyChange } from "../lib/inventory-daily";

const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

test("el dia de apertura se incluye en la serie", () => {
  // RGIS cuenta antes de abrir, asi que lo de ese dia ya pertenece a la ronda.
  const serie = buildInventoryDaily({
    basePieces: 1000,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-18"),
    movements: [],
    sales: [{ date: dia("2026-08-18"), pieces: 12 }]
  });
  assert.equal(serie.length, 1);
  assert.equal(serie[0].date, "2026-08-18");
  assert.equal(serie[0].sold, 12);
  assert.equal(serie[0].theoretical, 988);
});

test("emite tambien los dias sin movimiento", () => {
  // Una linea con huecos se lee como si el inventario hubiera dejado de existir
  // esos dias, cuando lo que paso es que no se movio.
  const serie = buildInventoryDaily({
    basePieces: 500,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-22"),
    movements: [{ date: dia("2026-08-20"), type: "RECEPCION", quantity: 40 }],
    sales: []
  });
  assert.deepEqual(serie.map((d) => d.date), [
    "2026-08-18",
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-22"
  ]);
  assert.deepEqual(serie.map((d) => d.theoretical), [500, 500, 540, 540, 540]);
});

test("el saldo se arrastra dia a dia", () => {
  const serie = buildInventoryDaily({
    basePieces: 1000,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-20"),
    movements: [
      { date: dia("2026-08-18"), type: "RECEPCION", quantity: 200 },
      { date: dia("2026-08-19"), type: "TRANSFERENCIA_SALIDA", quantity: 50 },
      { date: dia("2026-08-20"), type: "DEVOLUCION_CLIENTE", quantity: 3 }
    ],
    sales: [
      { date: dia("2026-08-18"), pieces: 10 },
      { date: dia("2026-08-19"), pieces: 20 },
      { date: dia("2026-08-20"), pieces: 30 }
    ]
  });
  // 1000 +200 -10 = 1190 | -50 -20 = 1120 | +3 -30 = 1093
  assert.deepEqual(serie.map((d) => d.theoretical), [1190, 1120, 1093]);
  assert.equal(serie[1].outgoing, 50);
  assert.equal(serie[2].incoming, 3);
});

test("la venta no cuenta como salida de traspaso", () => {
  // Van separadas porque en el resumen se leen distinto: una es operacion normal
  // y la otra es mercancia que sale de la tienda.
  const serie = buildInventoryDaily({
    basePieces: 100,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-18"),
    movements: [{ date: dia("2026-08-18"), type: "TRANSFERENCIA_SALIDA", quantity: 5 }],
    sales: [{ date: dia("2026-08-18"), pieces: 7 }]
  });
  assert.equal(serie[0].outgoing, 5);
  assert.equal(serie[0].sold, 7);
  assert.equal(serie[0].theoretical, 88);
});

test("SFS cuenta como salida", () => {
  const serie = buildInventoryDaily({
    basePieces: 100,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-18"),
    movements: [{ date: dia("2026-08-18"), type: "SFS", quantity: 4 }],
    sales: []
  });
  assert.equal(serie[0].outgoing, 4);
  assert.equal(serie[0].theoretical, 96);
});

test("los ajustes entran con su signo", () => {
  const serie = buildInventoryDaily({
    basePieces: 100,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-18"),
    movements: [
      { date: dia("2026-08-18"), type: "AJUSTE_NEGATIVO", quantity: 10 },
      { date: dia("2026-08-18"), type: "AJUSTE_POSITIVO", quantity: 3 }
    ],
    sales: []
  });
  assert.equal(serie[0].adjustments, -7);
  assert.equal(serie[0].theoretical, 93);
});

test("varios movimientos del mismo dia se acumulan", () => {
  const serie = buildInventoryDaily({
    basePieces: 0,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-18"),
    movements: [
      { date: dia("2026-08-18"), type: "RECEPCION", quantity: 4 },
      { date: dia("2026-08-18"), type: "RECEPCION", quantity: 13 }
    ],
    sales: []
  });
  assert.equal(serie[0].incoming, 17);
});

test("un rango invertido no produce serie", () => {
  const serie = buildInventoryDaily({
    basePieces: 100,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-17"),
    movements: [],
    sales: []
  });
  assert.deepEqual(serie, []);
});

test("la serie cruza el cambio de mes sin saltarse dias", () => {
  const serie = buildInventoryDaily({
    basePieces: 10,
    startDate: dia("2026-08-30"),
    until: dia("2026-09-02"),
    movements: [],
    sales: []
  });
  assert.deepEqual(serie.map((d) => d.date), ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
});

test("el cambio del dia compara contra ayer", () => {
  const serie = buildInventoryDaily({
    basePieces: 100,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-19"),
    movements: [],
    sales: [{ date: dia("2026-08-19"), pieces: 6 }]
  });
  assert.equal(dailyChange(serie), -6);
});

test("con un solo dia no hay comparacion", () => {
  // null y no 0: un cero se leeria como "no se movio", que es otra cosa.
  const serie = buildInventoryDaily({
    basePieces: 100,
    startDate: dia("2026-08-18"),
    until: dia("2026-08-18"),
    movements: [],
    sales: []
  });
  assert.equal(dailyChange(serie), null);
});
