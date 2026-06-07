import assert from "node:assert/strict";
import test from "node:test";
import { buildUserDashboardKpi, dashboardDateKey, dashboardDateRange } from "../lib/dashboard-kpi";

test("calcula la fecha del dashboard en horario de Mexico", () => {
  assert.equal(dashboardDateKey(new Date("2026-06-07T04:30:00.000Z")), "2026-06-06");
  assert.equal(dashboardDateKey(new Date("2026-06-07T06:30:00.000Z")), "2026-06-07");
});

test("crea un rango UTC exclusivo para la fecha normalizada del KPI", () => {
  const range = dashboardDateRange("2026-06-07");
  assert.equal(range.start.toISOString(), "2026-06-07T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-06-08T00:00:00.000Z");
});

test("muestra exclusivamente la venta y meta diaria del usuario autenticado", () => {
  const result = buildUserDashboardKpi("2026-06-07", {
    dailyGoal: 11313,
    dailySales: 10000,
    transactions: 22,
    pieces: 33,
    traffic: 50
  });

  assert.equal(result.dailyGoal, 11313);
  assert.equal(result.dailySales, 10000);
  assert.equal(result.transactions, 22);
  assert.equal(result.conversion, 44);
});

test("devuelve valores vacios cuando el usuario no tiene KPI del dia", () => {
  const result = buildUserDashboardKpi("2026-06-07", null);
  assert.equal(result.dailyGoal, 0);
  assert.equal(result.dailySales, 0);
  assert.equal(result.conversion, null);
});
