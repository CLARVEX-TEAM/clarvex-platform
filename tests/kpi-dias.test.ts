import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ventaPorDia, type FilaKpiDia } from "../lib/kpi-dias";

const fila = (fecha: string, userId: string, venta: number, extra: Partial<FilaKpiDia> = {}): FilaKpiDia => ({
  date: new Date(`${fecha}T00:00:00.000Z`),
  userId,
  name: userId.toUpperCase(),
  role: "ASESOR",
  photoUrl: null,
  dailySales: venta,
  dailyGoal: 5000,
  transactions: venta ? 3 : 0,
  pieces: venta ? 5 : 0,
  traffic: 120,
  ...extra
});

const FILAS = [
  fila("2026-11-08", "alonso", 6200.5),
  fila("2026-11-08", "waira", 3100.25),
  fila("2026-11-08", "adrian", 4000, { role: "SUBGERENTE" }),
  fila("2026-11-09", "alonso", 0, { dailyGoal: 5200 }), // solo la meta: Cuota Justa la escribe antes
  fila("2026-11-09", "waira", 0, { dailyGoal: 5200 })
];

test("gerencia: la tienda por día, el más reciente primero, sin pasar de hoy", () => {
  const dias = ventaPorDia(FILAS, { inicio: "2026-11-08", fin: "2026-11-14", hoy: "2026-11-09", soloUserId: null });
  assert.deepEqual(dias.map((d) => d.fecha), ["2026-11-09", "2026-11-08"]);
  const domingo = dias[1];
  assert.equal(domingo.venta, 13300.75);
  assert.equal(domingo.meta, 15000);
  assert.equal(domingo.alcance, 88.7);
  assert.equal(domingo.trafico, 120, "el tráfico es de la tienda: se toma una vez, no se suma");
  assert.deepEqual(domingo.personas.map((p) => p.userId), ["alonso", "adrian", "waira"], "de más a menos venta");
});

test("un día con SOLO la meta no es «vendió $0»: es sin captura", () => {
  const [lunes] = ventaPorDia(FILAS, { inicio: "2026-11-08", fin: "2026-11-09", hoy: "2026-11-09", soloUserId: null });
  assert.equal(lunes.capturado, false);
  assert.equal(lunes.meta, 10400);
  assert.ok(lunes.personas.every((p) => !p.capturado));
});

test("una devolución deja la venta en negativo y SÍ cuenta como captura", () => {
  const [dia] = ventaPorDia([fila("2026-11-08", "waira", -899, { transactions: 1, pieces: 0 })], { inicio: "2026-11-08", fin: "2026-11-08", hoy: "2026-11-09", soloUserId: null });
  assert.equal(dia.capturado, true);
  assert.equal(dia.venta, -899);
});

test("el asesor ve solo lo suyo y sin detalle de nadie", () => {
  const dias = ventaPorDia(FILAS, { inicio: "2026-11-08", fin: "2026-11-09", hoy: "2026-11-09", soloUserId: "waira" });
  assert.equal(dias[1].venta, 3100.25);
  assert.ok(dias.every((d) => d.personas.length === 0));
});

test("un día sin ninguna fila aparece vacío, no desaparece", () => {
  const dias = ventaPorDia([], { inicio: "2026-11-01", fin: "2026-11-03", hoy: "2026-11-09", soloUserId: null });
  assert.deepEqual(dias.map((d) => [d.fecha, d.capturado, d.venta]), [["2026-11-03", false, 0], ["2026-11-02", false, 0], ["2026-11-01", false, 0]]);
});

test("el API filtra al asesor EN LA CONSULTA, no en la pantalla", () => {
  const ruta = readFileSync(path.join(__dirname, "..", "app", "api", "kpis", "dias", "route.ts"), "utf8");
  assert.match(ruta, /\.\.\.\(gerencia \? \{\} : \{ userId: session\.userId \}\)/);
  assert.match(ruta, /storeId: session\.storeId/);
});
