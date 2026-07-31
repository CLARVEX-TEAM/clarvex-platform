import assert from "node:assert/strict";
import test from "node:test";
import { resolveMonterreyDate } from "../lib/cron-time";
import type { KpiFacts } from "../lib/services/kpi-service";

(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).ALLOW_INTEGRATION_TEST_DATABASE = "true";
(process.env as Record<string, string>).TEST_DATABASE_URL = "postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public";
(process.env as Record<string, string>).MOCK_EXTERNAL_SERVICES = "true";

const todayInfo = resolveMonterreyDate();
const yesterday = new Date(todayInfo.utcDate);
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const yesterdayKey = yesterday.toISOString().slice(0, 10);

function facts(label: string, conversion: number): KpiFacts {
  return {
    period: "week",
    startDate: yesterdayKey,
    endDate: yesterdayKey,
    weekNumber: 28,
    retailMonthLabel: label,
    store: {
      sales: 50000,
      goal: 45000,
      achievement: 111.1,
      transactions: 100,
      pieces: 200,
      traffic: 2500,
      upt: 2,
      aur: 250,
      ept: 500,
      conversion
    },
    team: [
      {
        userId: "adv-1",
        name: "Waira",
        role: "ASESOR",
        sales: 20000,
        goal: 18000,
        achievement: 111.1,
        transactions: 40,
        pieces: 80,
        traffic: 2500,
        upt: 2,
        aur: 250,
        ept: 500,
        conversion: 1.6,
        ranking: 1
      },
      {
        userId: "adv-2",
        name: "Jazmin",
        role: "ASESOR",
        sales: 15000,
        goal: 18000,
        achievement: 83.3,
        transactions: 35,
        pieces: 60,
        traffic: 2500,
        upt: 1.7,
        aur: 250,
        ept: 428,
        conversion: 1.4,
        ranking: 2
      }
    ]
  };
}

const capturedPrompts: string[] = [];
const mockPrisma = {
  pending: { findMany: async () => [{ title: "Curso Crehana", priority: "ALTA" }] },
  storeLog: { findMany: async () => [] },
  aiUsageLog: { create: async () => ({ id: "u1" }) }
};
(globalThis as { prisma?: unknown }).prisma = mockPrisma;

test("getExecutiveHealth usa getKpiReport y no inventa conversión", async () => {
  const { ClarvexIntelligence, __setGetKpiReportForTests } = await import("../lib/clarvex-intelligence");
  const todayKey = todayInfo.utcDate.toISOString().slice(0, 10);
  const calls: Array<{ period: string; dayOnly?: boolean; asOfDate?: Date; selectedDate: Date }> = [];
  __setGetKpiReportForTests(async (_session, params) => {
    calls.push({
      period: params.period,
      dayOnly: params.dayOnly,
      asOfDate: params.asOfDate,
      selectedDate: params.selectedDate
    });
    const conversion = params.dayOnly ? 4.0 : params.period === "month" ? 3.8 : 3.4;
    const base = facts(params.period, conversion);
    return {
      ...base,
      selectedDate: params.dayOnly ? yesterdayKey : todayKey,
      availableWeeks: [],
      availableRetailMonths: [],
      workedDays: null,
      currentUserId: "mgr-1",
      role: "SUBGERENTE" as const,
      store: base.store
        ? {
            userId: "store",
            userName: "Tienda",
            role: "GERENTE" as const,
            avatar: "TI",
            photoUrl: null,
            sales: base.store.sales,
            goal: base.store.goal,
            achievement: base.store.achievement,
            transactions: base.store.transactions,
            pieces: base.store.pieces,
            upt: base.store.upt,
            aur: base.store.aur,
            ept: base.store.ept,
            conversion: base.store.conversion,
            traffic: base.store.traffic,
            ranking: 0,
            grossSales: null,
            orkestraSales: null,
            orkestraTransactions: null,
            orkestraPieces: null,
            discountAmount: null,
            discountMargin: null,
            discountLimit: null,
            commissionAmount: 0,
            commissionPercent: 0,
            commissionMinimum: null,
            crmTransactions: null,
            posTransactions: null
          }
        : null,
      own: null,
      team: base.team.map((item) => ({
        userId: item.userId,
        userName: item.name,
        role: item.role,
        avatar: item.name.slice(0, 2).toUpperCase(),
        photoUrl: null,
        sales: item.sales,
        goal: item.goal,
        achievement: item.achievement,
        transactions: item.transactions,
        pieces: item.pieces,
        upt: item.upt,
        aur: item.aur,
        ept: item.ept,
        conversion: item.conversion,
        traffic: item.traffic,
        ranking: item.ranking,
        grossSales: null,
        orkestraSales: null,
        orkestraTransactions: null,
        orkestraPieces: null,
        discountAmount: null,
        discountMargin: null,
        discountLimit: null,
        commissionAmount: 0,
        commissionPercent: 0,
        commissionMinimum: null,
        crmTransactions: null,
        posTransactions: null
      })),
      hasDiscountSource: false,
      latestDiscountWeek: null,
      commissionRules: []
    };
  });

  const original = (ClarvexIntelligence as unknown as { callGemini: (...args: unknown[]) => Promise<string> }).callGemini;
  (ClarvexIntelligence as unknown as { callGemini: (prompt: string) => Promise<string> }).callGemini = async (prompt: string) => {
    capturedPrompts.push(prompt);
    return JSON.stringify({
      storeHealth: "AMARILLO",
      fortheleses: ["Buen alcance semanal"],
      risks: ["Conversión semanal en 3.4%"],
      topAdvisor: "Waira (alcance 111.1%, conv 1.6%)",
      opportunityAdvisor: "Jazmin (alcance 83.3%, conv 1.4%)",
      priorities: ["Elevar conversión"],
      actions: ["Coaching matutino"]
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

  assert.equal(result.kpiFacts.week.store?.conversion, 3.4);
  assert.equal(result.kpiFacts.day.store?.conversion, 4.0);
  assert.equal(result.kpiFacts.week.team[0].name, "Waira");
  assert.equal(result.kpiFacts.week.team[0].conversion, 1.6);
  assert.equal(result.kpiFacts.asOf, todayKey);
  assert.equal(result.kpiFacts.dayAsOf, yesterdayKey);

  const weekCall = calls.find((c) => c.period === "week" && !c.dayOnly);
  const monthCall = calls.find((c) => c.period === "month");
  const dayCall = calls.find((c) => c.dayOnly);
  assert.ok(weekCall);
  assert.ok(monthCall);
  assert.ok(dayCall);
  assert.equal(weekCall?.asOfDate, undefined);
  assert.equal(monthCall?.asOfDate, undefined);
  assert.equal(weekCall?.selectedDate.toISOString().slice(0, 10), todayKey);
  assert.equal(monthCall?.selectedDate.toISOString().slice(0, 10), todayKey);
  assert.equal(dayCall?.selectedDate.toISOString().slice(0, 10), yesterdayKey);

  const prompt = capturedPrompts.at(-1) ?? "";
  assert.match(prompt, /getKpiReport|pestaña KPIs/i);
  assert.match(prompt, /3\.4%/);
  assert.match(prompt, /PROHIBIDO recalcular/i);
  assert.match(prompt, /semana\/mes retail completo|igual que Ranking/i);
  assert.doesNotMatch(prompt, /99999/);
  assert.doesNotMatch(prompt, /hasta ayer inclusive/);

  (ClarvexIntelligence as unknown as { callGemini: typeof original }).callGemini = original;
  __setGetKpiReportForTests(null);
});
