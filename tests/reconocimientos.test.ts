import { test } from "node:test";
import assert from "node:assert/strict";
import { domingoDe, fechaLarga, pendientes, type AporteReco } from "../lib/reconocimientos";

const a = (userId: string, fecha: string, monto: number, minuto = 0, donativos = 1): AporteReco => ({
  userId,
  nombre: userId.toUpperCase(),
  fecha,
  monto,
  donativos,
  creado: new Date(Date.UTC(2026, 10, 7, 12, minuto))
});

test("el primer donativo es el más antiguo, y se manda una sola vez", () => {
  const aportes = [a("waira", "2026-11-07", 40, 5), a("alonso", "2026-11-07", 25, 1)];
  const r = pendientes({ aportes, hoy: "2026-11-07", ya: new Set() });
  assert.deepEqual(r.filter((x) => x.tipo === "primero").map((x) => x.userId), ["alonso"]);
  assert.equal(pendientes({ aportes, hoy: "2026-11-07", ya: new Set(["primero"]) }).length, 0);
});

test("un monto en cero no es un donativo", () => {
  const r = pendientes({ aportes: [a("itzel", "2026-11-06", 0), a("alonso", "2026-11-07", 25)], hoy: "2026-11-07", ya: new Set() });
  assert.equal(r[0].userId, "alonso");
});

test("gran día desde $150, por persona y día, y no de hace semanas", () => {
  const aportes = [a("jazmin", "2026-11-07", 150), a("waira", "2026-11-07", 149.99), a("adrian", "2026-11-01", 300)];
  const r = pendientes({ aportes, hoy: "2026-11-07", ya: new Set(["primero"]) }).filter((x) => x.tipo === "dia");
  assert.deepEqual(r.map((x) => x.clave), ["dia:2026-11-07:jazmin"]);
});

test("el MVP es de la semana ANTERIOR, y un empate reconoce a los dos", () => {
  const aportes = [a("waira", "2026-11-02", 100), a("waira", "2026-11-03", 20), a("alonso", "2026-11-07", 120), a("itzel", "2026-11-08", 500)];
  // Domingo 8: la semana pasada es del 1 al 7.
  const r = pendientes({ aportes, hoy: "2026-11-08", ya: new Set(["primero", "dia:2026-11-08:itzel"]) }).filter((x) => x.tipo === "mvp");
  assert.deepEqual(r.map((x) => x.clave).sort(), ["mvp:2026-11-01:alonso", "mvp:2026-11-01:waira"]);
  assert.equal(r.find((x) => x.userId === "waira")?.monto, 120);
});

test("sin donativos en la semana pasada no hay MVP", () => {
  const r = pendientes({ aportes: [a("itzel", "2026-11-08", 20)], hoy: "2026-11-09", ya: new Set(["primero"]) });
  assert.equal(r.length, 0);
});

test("las fechas en español", () => {
  assert.equal(fechaLarga("2026-11-07"), "Sábado 7 de noviembre");
  assert.equal(domingoDe("2026-11-07"), "2026-11-01");
  assert.equal(domingoDe("2026-11-08"), "2026-11-08");
});
