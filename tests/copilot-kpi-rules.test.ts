import assert from "node:assert/strict";
import test from "node:test";
import { COPILOT_KPI_RULES } from "../lib/ai/kpi-source-reference";
import { buildSystemPrompt } from "../lib/ai/prompts/system";
import { kpiPeriodMeta } from "../lib/ai/tools/shared/kpi-period-meta";

test("Copilot KPI rules — retail calendar and no manual calculation", () => {
  assert.match(COPILOT_KPI_RULES, /RETAIL/);
  assert.match(COPILOT_KPI_RULES, /NO MES NATURAL/);
  assert.match(COPILOT_KPI_RULES, /getStorePerformance/);
  assert.match(COPILOT_KPI_RULES, /getStoreDailyResults/);
  assert.match(COPILOT_KPI_RULES, /remainingToGoal/);
  assert.match(COPILOT_KPI_RULES, /PROHIBIDO/);
});

test("buildSystemPrompt incluye reglas KPI completas", () => {
  const prompt = buildSystemPrompt({
    userId: "u1",
    storeId: "s1",
    role: "GERENTE",
    name: "Gerente",
    platformAdmin: false,
    todayKey: "2026-07-10",
    now: new Date("2026-07-10T00:00:00.000Z"),
    timeZone: "America/Mexico_City"
  }, 3);
  assert.match(prompt, /getKpiReport/);
  assert.match(prompt, /Semana retail/);
  assert.match(prompt, /Mes retail/);
});

test("kpiPeriodMeta etiqueta semana y mes retail", () => {
  const week = kpiPeriodMeta({
    period: "week",
    startDate: "2026-07-05",
    endDate: "2026-07-11",
    weekNumber: 27,
    retailMonthLabel: "Julio 2026"
  });
  assert.match(week.periodLabel, /Semana retail 27/);

  const month = kpiPeriodMeta({
    period: "month",
    startDate: "2026-06-29",
    endDate: "2026-07-26",
    weekNumber: null,
    retailMonthLabel: "Julio 2026"
  });
  assert.match(month.periodLabel, /Mes retail Julio 2026/);
  assert.match(month.calendarNote, /RETAIL/);
});
