import assert from "node:assert/strict";
import test from "node:test";
import { buildCopilotContext, retailTodayUtc } from "../lib/ai/context";
import { buildSystemPrompt } from "../lib/ai/prompts/system";
import { dashboardDateKey } from "../lib/dashboard-kpi";

const session = {
  userId: "u1",
  storeId: "s1",
  role: "GERENTE" as const,
  name: "Gerente",
  employeeNumber: "81893",
  platformAdmin: false
};

test("retailTodayUtc usa America/Monterrey aunque el servidor esté en UTC", () => {
  // 04:30 UTC del 11-jul = 22:30 del 10-jul en Monterrey (verano UTC-6)
  const serverNow = new Date("2026-07-11T04:30:00.000Z");
  assert.equal(dashboardDateKey(serverNow, "America/Monterrey"), "2026-07-10");
  assert.equal(retailTodayUtc(serverNow).toISOString(), "2026-07-10T00:00:00.000Z");
});

test("buildCopilotContext normaliza hoy a fecha retail, no UTC del VPS", () => {
  const ctx = buildCopilotContext(session, new Date("2026-07-11T04:30:00.000Z"));
  assert.equal(ctx.timeZone, "America/Monterrey");
  assert.equal(ctx.todayKey, "2026-07-10");
});

test("system prompt declara la fecha de hoy en zona Monterrey", () => {
  const ctx = buildCopilotContext(session, new Date("2026-07-11T04:30:00.000Z"));
  const prompt = buildSystemPrompt(ctx, 1);
  assert.match(prompt, /Fecha de hoy: 2026-07-10/);
  assert.match(prompt, /America\/Monterrey/);
});
