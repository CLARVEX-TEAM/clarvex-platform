import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesTrend } from "../lib/trend";

const TODAY = "2026-06-14";

test("agrupa por dia, suma venta/meta e ignora dias futuros", () => {
  const rows = [
    { date: "2026-06-13", dailySales: 100, dailyGoal: 120 },
    { date: "2026-06-13", dailySales: 50, dailyGoal: 80 }, // mismo dia (otro asesor)
    { date: "2026-06-14", dailySales: 200, dailyGoal: 150 },
    { date: "2026-06-20", dailySales: 0, dailyGoal: 150 } // futuro -> se ignora
  ];
  const trend = buildSalesTrend(rows, TODAY);
  assert.equal(trend.length, 2);
  assert.deepEqual(trend[0], { date: "2026-06-13", label: "13", sales: 150, goal: 200 });
  assert.deepEqual(trend[1], { date: "2026-06-14", label: "14", sales: 200, goal: 150 });
});

test("toma solo los ultimos N dias", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    dailySales: i,
    dailyGoal: 100
  })).filter((r) => r.date <= TODAY);
  const trend = buildSalesTrend(rows, TODAY, 7);
  assert.equal(trend.length, 7);
  assert.equal(trend[0].date, "2026-06-08");
  assert.equal(trend[6].date, "2026-06-14");
});
