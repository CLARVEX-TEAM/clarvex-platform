import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentPeriods,
  buildStoreAgent,
  buildWeeklyPerformanceActions
} from "../lib/retool-store-agent";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function row(iso: string, sales: number, goal: number, traffic: number | null = null) {
  return {
    date: day(iso),
    dailySales: sales,
    dailyGoal: goal,
    transactions: sales > 0 ? 2 : 0,
    pieces: sales > 0 ? 3 : 0,
    traffic
  };
}

test("no marca Cuota Justa pendiente cuando la cuota y el RDS ya fueron guardados", () => {
  const actions = buildWeeklyPerformanceActions([
    {
      id: "close-1",
      weekStart: day("2026-08-16"),
      weekEnd: day("2026-08-22"),
      weekNumber: 34,
      status: "DRAFT",
      quotaSavedAt: new Date("2026-08-23T10:00:00.000Z"),
      reportSavedAt: new Date("2026-08-23T10:05:00.000Z"),
      finalizedAt: null
    }
  ]);

  assert.deepEqual(actions, []);
});

test("marca RDS pendiente sin volver a decir que Cuota Justa falta", () => {
  const actions = buildWeeklyPerformanceActions([
    {
      id: "close-1",
      weekStart: day("2026-08-16"),
      weekEnd: day("2026-08-22"),
      weekNumber: 34,
      status: "DRAFT",
      quotaSavedAt: new Date("2026-08-23T10:00:00.000Z"),
      reportSavedAt: null,
      finalizedAt: null
    }
  ]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.title, "Guardar RDS semanal");
  assert.equal(actions[0]?.route.path, "/cuota-justa");
});

test("elige MTD como KPI principal cuando hoy no tiene venta pero el mes sí", () => {
  const periods = buildAgentPeriods({
    rows: [
      row("2026-08-02", 10_000, 8_000, 100),
      row("2026-08-16", 12_000, 9_000, 120),
      row("2026-08-30", 0, 0, null),
      row("2026-07-06", 7_000, 7_000, 90),
      row("2026-07-20", 8_000, 7_000, 95)
    ],
    today: day("2026-08-30"),
    todayEnd: day("2026-08-30"),
    weekStart: day("2026-08-30"),
    retailMonthStart: day("2026-08-02"),
    retailMonthEnd: day("2026-09-05"),
    previousWeekStart: day("2026-08-23"),
    previousWeekEnd: day("2026-08-29"),
    previousMonthStart: day("2026-06-29"),
    previousMonthEnd: day("2026-08-01"),
    beforePreviousMonthStart: day("2026-06-01"),
    beforePreviousMonthEnd: day("2026-06-28")
  });
  const agent = buildStoreAgent({
    generatedAt: new Date("2026-08-30T12:00:00.000Z"),
    primary: periods.primary,
    week: periods.week,
    monthContext: periods.monthContext,
    attention: []
  });

  assert.equal(agent.primaryKpi.key, "mtd");
  assert.equal(agent.primaryKpi.metric.sales, 22_000);
  assert.equal(agent.primaryKpi.metric.traffic, 220);
});
