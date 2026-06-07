import assert from "node:assert/strict";
import test from "node:test";
import { mergeRdvWeeks, reconstructRdvWeek } from "../lib/rdv-week";

test("reconstruye Semana 22 del 31 de mayo al 6 de junio", () => {
  const week = reconstructRdvWeek(new Date("2026-06-03T00:00:00.000Z"));
  assert.equal(week.weekNumber, 22);
  assert.equal(week.weekStart.toISOString(), "2026-05-31T00:00:00.000Z");
  assert.equal(week.weekEnd.toISOString(), "2026-06-06T00:00:00.000Z");
});

test("agrupa fechas legacy de la misma semana RDV", () => {
  const weeks = mergeRdvWeeks([], [
    new Date("2026-05-31T00:00:00.000Z"),
    new Date("2026-06-01T00:00:00.000Z"),
    new Date("2026-06-06T00:00:00.000Z")
  ]);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].weekNumber, 22);
});
