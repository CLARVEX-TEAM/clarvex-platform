import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklySchedule } from "../lib/schedule-report";

test("conserva estados reales y usa UNKNOWN cuando falta Schedule", () => {
  const result = buildWeeklySchedule(
    [{ id: "alonso", name: "Alonso", role: "ASESOR" }],
    [{ id: "s1", userId: "alonso", date: new Date("2026-06-07T00:00:00.000Z"), day: "Dom", status: "PAID_DAY", statusRaw: "PAGO DIA", startTime: null, endTime: null, zone: null }],
    new Date("2026-06-07T00:00:00.000Z")
  );

  assert.equal(result.length, 7);
  assert.equal(result[0].status, "PAID_DAY");
  assert.equal(result[0].statusRaw, "PAGO DIA");
  assert.equal(result[1].status, "UNKNOWN");
  assert.equal(result[1].statusRaw, null);
});

test("no convierte OFF en WORKING", () => {
  const result = buildWeeklySchedule(
    [{ id: "alonso", name: "Alonso", role: "ASESOR" }],
    [{ id: "s2", userId: "alonso", date: new Date("2026-06-08T00:00:00.000Z"), day: "Lun", status: "OFF", statusRaw: "DESCANSO", startTime: null, endTime: null, zone: null }],
    new Date("2026-06-07T00:00:00.000Z")
  );

  assert.equal(result[1].status, "OFF");
});
