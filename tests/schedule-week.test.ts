import assert from "node:assert/strict";
import test from "node:test";
import { dateKey, endOfWeek, parseWeekStart, startOfWeek } from "../lib/schedule-week";

test("calcula una semana de domingo a sabado", () => {
  const start = startOfWeek(new Date(2026, 5, 10));
  assert.equal(dateKey(start), "2026-06-07");
  assert.equal(dateKey(endOfWeek(start)), "2026-06-13");
});

test("acepta solamente domingos como weekStart", () => {
  assert.equal(dateKey(parseWeekStart("2026-06-07")!), "2026-06-07");
  assert.equal(parseWeekStart("2026-06-08"), null);
  assert.equal(parseWeekStart("fecha-invalida"), null);
});
