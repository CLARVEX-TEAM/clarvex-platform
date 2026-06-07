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

test("prioriza el registro importado sobre un horario legacy del mismo dia", () => {
  const result = buildWeeklySchedule(
    [{ id: "jazmin", name: "Jazmin", role: "ASESOR" }],
    [
      { id: "imported", userId: "jazmin", date: new Date("2026-06-10T00:00:00.000Z"), day: "Mie", status: "OFF", statusRaw: "DESCANSO", startTime: null, endTime: null, zone: null },
      { id: "legacy", userId: "jazmin", date: new Date("2026-06-10T12:00:00.000Z"), day: "Vie", status: "WORKING", statusRaw: null, startTime: "10:00", endTime: "18:00", zone: "Entrada" }
    ],
    new Date("2026-06-07T00:00:00.000Z")
  );

  assert.equal(result[3].status, "OFF");
  assert.equal(result[3].statusRaw, "DESCANSO");
});
