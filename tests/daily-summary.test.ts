import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvisorMessage, buildManagerSummary, firstName, resolveDailyCase } from "../lib/daily-summary";

test("usa solo el primer nombre del asesor", () => {
  assert.equal(firstName("WAIRA ZITLALI POPOCA"), "WAIRA");
  assert.equal(firstName("  Juan  "), "Juan");
});

test("selecciona el caso correcto segun venta y alcance", () => {
  assert.equal(resolveDailyCase(0, 0), "F"); // sin ventas
  assert.equal(resolveDailyCase(100, 120), "A"); // > 115%
  assert.equal(resolveDailyCase(100, 115), "B"); // 115% exacto cae en B
  assert.equal(resolveDailyCase(100, 100), "B"); // 100% exacto
  assert.equal(resolveDailyCase(100, 99), "C"); // 80-99
  assert.equal(resolveDailyCase(100, 80), "C"); // 80% exacto
  assert.equal(resolveDailyCase(100, 79), "D"); // 50-79
  assert.equal(resolveDailyCase(100, 50), "D"); // 50% exacto
  assert.equal(resolveDailyCase(100, 49), "E"); // < 50
});

test("caso F cuando venta es 0 aunque el alcance calculado fuera alto", () => {
  const message = buildAdvisorMessage({ name: "Ana Lopez", sales: 0, goal: 0 });
  assert.equal(message.case, "F");
  assert.match(message.body, /no se registraron ventas a tu nombre/);
});

test("formatea venta y diferencia como pesos sin decimales y redondea alcance", () => {
  const message = buildAdvisorMessage({ name: "Carlos", sales: 8000, goal: 10000 });
  assert.equal(message.case, "C");
  assert.equal(message.achievement, 80);
  assert.match(message.body, /\$8,000/);
  assert.match(message.body, /\$2,000/); // diferencia para llegar al 100%
});

test("resumen de gerencia calcula alcance de tienda y conteos", () => {
  const summary = buildManagerSummary({
    dateLabel: "13 de junio",
    storeSales: 90000,
    storeGoal: 100000,
    overGoal: 3,
    near: 1,
    below: 2
  });
  assert.match(summary.body, /Resumen de cierre — 13 de junio/);
  assert.match(summary.body, /Alcance: 90%/);
  assert.match(summary.body, /Sobre meta: 3 asesores/);
  assert.match(summary.body, /Cerca: 1 asesores/);
  assert.match(summary.body, /Abajo: 2 asesores/);
});
