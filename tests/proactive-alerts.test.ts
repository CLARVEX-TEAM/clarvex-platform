import assert from "node:assert/strict";
import test from "node:test";
import { weekGoalPeriodKey } from "../lib/retail-alert-log";

test("weekGoalPeriodKey usa numero de semana RDV cuando existe", () => {
  assert.equal(weekGoalPeriodKey(25, "2026-06-29", "2026-07-05"), "week:25");
});

test("weekGoalPeriodKey usa rango de fechas sin numero RDV", () => {
  assert.equal(weekGoalPeriodKey(null, "2026-06-29", "2026-07-05"), "week:2026-06-29:2026-07-05");
});
