import assert from "node:assert/strict";
import test from "node:test";
import { weeklyPerformancePeriods } from "../lib/weekly-performance-periods";

test("RDS usa la semana que termina y Cuota Justa la inmediata siguiente", () => {
  const periods = weeklyPerformancePeriods(new Date("2026-08-22T00:00:00.000Z"));
  assert.equal(periods.report.weekNumber, 33);
  assert.equal(periods.report.weekStart.toISOString().slice(0, 10), "2026-08-16");
  assert.equal(periods.report.weekEnd.toISOString().slice(0, 10), "2026-08-22");
  assert.equal(periods.quota.weekNumber, 34);
  assert.equal(periods.quota.weekStart.toISOString().slice(0, 10), "2026-08-23");
  assert.equal(periods.quota.weekEnd.toISOString().slice(0, 10), "2026-08-29");
});
