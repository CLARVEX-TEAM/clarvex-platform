import assert from "node:assert/strict";
import test from "node:test";
import { getKpiMonthRange, periodDateKey } from "../lib/kpi-period";
import { aggregateKpis, aggregateStore } from "../lib/kpi-report";

test("limita el mes KPI al calendario seleccionado", () => {
  const range = getKpiMonthRange(new Date("2026-06-18T00:00:00.000Z"));
  assert.equal(periodDateKey(range.start), "2026-06-01");
  assert.equal(periodDateKey(range.end), "2026-06-30");
});

test("acumula ventas, metas y ranking por periodo", () => {
  const base = { conversion: 30, grossSales: null, discountAmount: null, discountLimit: null, commissionAmount: 0, commissionPercent: 2 };
  const reports = aggregateKpis([
    { ...base, userId: "a", dailySales: 100, dailyGoal: 100, transactions: 2, pieces: 4, user: { name: "Ana", role: "ASESOR", photoUrl: null } },
    { ...base, userId: "a", dailySales: 150, dailyGoal: 100, transactions: 3, pieces: 6, user: { name: "Ana", role: "ASESOR", photoUrl: null } },
    { ...base, userId: "b", dailySales: 200, dailyGoal: 200, transactions: 4, pieces: 4, user: { name: "Beto", role: "ASESOR", photoUrl: null } }
  ]);

  assert.equal(reports[0].userId, "a");
  assert.equal(reports[0].sales, 250);
  assert.equal(reports[0].goal, 200);
  assert.equal(reports[0].ranking, 1);
  assert.equal(aggregateStore(reports)?.sales, 450);
});
