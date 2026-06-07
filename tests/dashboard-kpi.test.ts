import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDashboardKpis, dashboardDateKey, dashboardDateRange } from "../lib/dashboard-kpi";

test("calcula la fecha del dashboard en horario de Mexico", () => {
  assert.equal(dashboardDateKey(new Date("2026-06-07T04:30:00.000Z")), "2026-06-06");
  assert.equal(dashboardDateKey(new Date("2026-06-07T06:30:00.000Z")), "2026-06-07");
});

test("crea un rango UTC exclusivo para la fecha normalizada del KPI", () => {
  const range = dashboardDateRange("2026-06-07");
  assert.equal(range.start.toISOString(), "2026-06-07T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-06-08T00:00:00.000Z");
});

test("suma venta y meta diaria de todas las filas de tienda", () => {
  const result = aggregateDashboardKpis("2026-06-07", [
    { dailyGoal: 5000, dailySales: 4100, transactions: 10, pieces: 15, traffic: 20 },
    { dailyGoal: 6313, dailySales: 5900, transactions: 12, pieces: 18, traffic: 30 }
  ]);

  assert.equal(result.dailyGoal, 11313);
  assert.equal(result.dailySales, 10000);
  assert.equal(result.transactions, 22);
  assert.equal(result.conversion, 44);
});
