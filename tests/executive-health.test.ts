import assert from "node:assert/strict";
import test from "node:test";
import { resolveMonterreyDate } from "../lib/cron-time";

(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).ALLOW_INTEGRATION_TEST_DATABASE = "true";
(process.env as Record<string, string>).TEST_DATABASE_URL = "postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public";
(process.env as Record<string, string>).MOCK_EXTERNAL_SERVICES = "true";

const todayInfo = resolveMonterreyDate();
const yesterday = new Date(todayInfo.utcDate);
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const twoDaysAgo = new Date(yesterday);
twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 1);
const weekStart = new Date(yesterday);
weekStart.setUTCDate(weekStart.getUTCDate() - yesterday.getUTCDay());
const weekEnd = new Date(weekStart);
weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

const periodRows = [
  {
    userId: "adv-1",
    date: twoDaysAgo,
    dailySales: 10000,
    dailyGoal: 10000,
    transactions: 40,
    pieces: 80,
    traffic: 200,
    upt: 2,
    conversion: 20,
    user: { name: "Waira", role: "ASESOR" as const }
  },
  {
    userId: "adv-2",
    date: twoDaysAgo,
    dailySales: 5000,
    dailyGoal: 10000,
    transactions: 20,
    pieces: 30,
    traffic: 200,
    upt: 1.5,
    conversion: 10,
    user: { name: "Jazmin", role: "ASESOR" as const }
  },
  {
    userId: "mgr-1",
    date: twoDaysAgo,
    dailySales: 0,
    dailyGoal: 0,
    transactions: 0,
    pieces: 0,
    traffic: 200,
    upt: 0,
    conversion: 0,
    user: { name: "Jesus Subgerente", role: "SUBGERENTE" as const }
  },
  // Hoy no debe entrar al análisis (corte = ayer).
  {
    userId: "adv-1",
    date: todayInfo.utcDate,
    dailySales: 99999,
    dailyGoal: 10000,
    transactions: 100,
    pieces: 200,
    traffic: 500,
    upt: 2,
    conversion: 20,
    user: { name: "Waira", role: "ASESOR" as const }
  }
];

const capturedPrompts: string[] = [];

const mockPrisma = {
  kpi: {
    findMany: async (args: { where?: { date?: { gte?: Date; lt?: Date }; weekStart?: unknown }; distinct?: string[] }) => {
      if (args.distinct?.includes("weekStart")) {
        return [{ weekStart, weekEnd }];
      }
      const gte = args.where?.date?.gte?.getTime() ?? 0;
      const lt = args.where?.date?.lt?.getTime() ?? Number.POSITIVE_INFINITY;
      return periodRows.filter((row) => {
        const t = row.date.getTime();
        return t >= gte && t < lt;
      });
    }
  },
  pending: { findMany: async () => [{ title: "Curso Crehana", priority: "ALTA" }] },
  storeLog: { findMany: async () => [] },
  aiUsageLog: { create: async () => ({ id: "u1" }) }
};

(globalThis as { prisma?: unknown }).prisma = mockPrisma;

test("getExecutiveHealth corta en ayer y no marca gerencia como oportunidad", async () => {
  const { ClarvexIntelligence } = await import("../lib/clarvex-intelligence");
  const original = (ClarvexIntelligence as unknown as { callGemini: (...args: unknown[]) => Promise<string> }).callGemini;
  (ClarvexIntelligence as unknown as { callGemini: (prompt: string) => Promise<string> }).callGemini = async (prompt: string) => {
    capturedPrompts.push(prompt);
    return JSON.stringify({
      storeHealth: "AMARILLO",
      fortheleses: ["Buen UPT de Waira"],
      risks: ["Jazmin debajo de meta"],
      topAdvisor: "Waira (100% de su meta del periodo)",
      opportunityAdvisor: "Jazmin (50% de su meta del periodo)",
      priorities: ["Coaching a Jazmin"],
      actions: ["Revisión matutina de conversión"]
    });
  };

  const result = await ClarvexIntelligence.getExecutiveHealth({
    userId: "mgr-1",
    storeId: "store-1",
    role: "SUBGERENTE",
    name: "Jesus",
    employeeNumber: "1",
    platformAdmin: false
  });

  assert.equal(result.topAdvisor.includes("Waira"), true);
  assert.equal(result.opportunityAdvisor.toLowerCase().includes("jazmin"), true);
  assert.equal(result.opportunityAdvisor.toLowerCase().includes("jesus"), false);

  const prompt = capturedPrompts.at(-1) ?? "";
  assert.match(prompt, /hasta ayer/i);
  assert.match(prompt, /solo rol ASESOR/i);
  assert.doesNotMatch(prompt, /99999/);
  assert.match(prompt, /NO evalúes a GERENTE\/SUBGERENTE/);
  assert.match(prompt, /Waira/);
  assert.match(prompt, /Jazmin/);

  (ClarvexIntelligence as unknown as { callGemini: typeof original }).callGemini = original;
});
