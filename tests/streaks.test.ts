import assert from "node:assert/strict";
import test from "node:test";
import { computeDailyStreak } from "../lib/streaks";

const TODAY = "2026-06-14";

test("cuenta dias consecutivos cumpliendo meta hasta hoy", () => {
  const rows = [
    { date: "2026-06-10", sales: 100, goal: 100 },
    { date: "2026-06-11", sales: 120, goal: 100 },
    { date: "2026-06-12", sales: 90, goal: 100 }, // falla -> rompe
    { date: "2026-06-13", sales: 110, goal: 100 },
    { date: "2026-06-14", sales: 130, goal: 100 }
  ];
  const result = computeDailyStreak(rows, TODAY);
  assert.equal(result.current, 2); // 13 y 14
  assert.equal(result.best, 2);    // 10-11 y 13-14 empatan en 2
});

test("los dias de descanso (meta 0) no rompen la racha", () => {
  const rows = [
    { date: "2026-06-12", sales: 100, goal: 100 },
    { date: "2026-06-13", sales: 0, goal: 0 }, // descanso, se omite
    { date: "2026-06-14", sales: 100, goal: 100 }
  ];
  assert.equal(computeDailyStreak(rows, TODAY).current, 2);
});

test("ignora dias futuros", () => {
  const rows = [
    { date: "2026-06-14", sales: 100, goal: 100 },
    { date: "2026-06-20", sales: 0, goal: 100 } // futuro: se ignora
  ];
  assert.equal(computeDailyStreak(rows, TODAY).current, 1);
});

test("sin cumplir hoy la racha actual es 0", () => {
  const rows = [
    { date: "2026-06-13", sales: 100, goal: 100 },
    { date: "2026-06-14", sales: 50, goal: 100 }
  ];
  const result = computeDailyStreak(rows, TODAY);
  assert.equal(result.current, 0);
  assert.equal(result.best, 1);
});
