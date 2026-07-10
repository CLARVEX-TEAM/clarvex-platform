import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).ALLOW_INTEGRATION_TEST_DATABASE = "true";
(process.env as Record<string, string>).TEST_DATABASE_URL = "postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public";
(process.env as Record<string, string>).MOCK_EXTERNAL_SERVICES = "true";

const mockSummaryDb = new Map<string, any>();

const mockPrisma: any = {
  aiDailySummary: {
    findUnique: async (args: any) => {
      const key = `${args.where.storeId_summaryDate_type_scopeKey.storeId}:${args.where.storeId_summaryDate_type_scopeKey.summaryDate.toISOString()}`;
      return mockSummaryDb.get(key) || null;
    },
    upsert: async (args: any) => {
      const key = `${args.where.storeId_summaryDate_type_scopeKey.storeId}:${args.where.storeId_summaryDate_type_scopeKey.summaryDate.toISOString()}`;
      const existing = mockSummaryDb.get(key);
      const data = {
        id: existing?.id || `summary-${Math.random()}`,
        storeId: args.create.storeId,
        summaryDate: args.create.summaryDate,
        type: args.create.type,
        scopeKey: args.create.scopeKey,
        status: args.update?.status ?? args.create.status ?? "PENDING",
        content: args.update?.content === Prisma.DbNull ? null : (args.update?.content ?? existing?.content ?? null),
        metricsSnapshot: args.update?.metricsSnapshot ?? existing?.metricsSnapshot ?? null,
        sourceDataHash: args.update?.sourceDataHash ?? existing?.sourceDataHash ?? null,
        errorMessage: args.update?.errorMessage ?? null,
        generatedAt: args.update?.generatedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      mockSummaryDb.set(key, data);
      return data;
    },
    update: async (args: any) => {
      const id = args.where.id;
      let record: any = null;
      let recordKey = "";
      for (const [key, value] of Array.from(mockSummaryDb.entries())) {
        if (value.id === id) {
          record = value;
          recordKey = key;
          break;
        }
      }
      if (!record) throw new Error("Record not found for update");
      const updated = {
        ...record,
        ...args.data,
        content: args.data.content === Prisma.DbNull ? null : args.data.content,
        updatedAt: new Date()
      };
      mockSummaryDb.set(recordKey, updated);
      return updated;
    }
  },
  pending: { findMany: async () => [] },
  auditLog: { create: async (args: any) => ({ id: `audit-${Math.random()}`, ...args.data }) }
};

(globalThis as any).prisma = mockPrisma;

function buildMockReport(storeId: string) {
  if (storeId === "store-no-data") {
    return {
      period: "week" as const,
      selectedDate: "2026-07-09",
      startDate: "2026-07-09",
      endDate: "2026-07-09",
      weekNumber: 28,
      availableWeeks: [],
      availableRetailMonths: [],
      retailMonthLabel: null,
      workedDays: null,
      currentUserId: "mgr-1",
      role: "GERENTE" as const,
      store: { userId: "store", userName: "Tienda", role: "GERENTE" as const, avatar: "TI", photoUrl: null, sales: 0, goal: 0, achievement: 0, transactions: 0, pieces: 0, upt: null, aur: null, ept: null, conversion: null, traffic: null, ranking: 0, grossSales: null, orkestraSales: null, orkestraTransactions: null, orkestraPieces: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0, commissionMinimum: null },
      own: null,
      team: [],
      hasDiscountSource: false,
      latestDiscountWeek: null,
      commissionRules: []
    };
  }
  return {
    period: "week" as const,
    selectedDate: "2026-07-09",
    startDate: "2026-07-09",
    endDate: "2026-07-09",
    weekNumber: 28,
    availableWeeks: [],
    availableRetailMonths: [],
    retailMonthLabel: null,
    workedDays: null,
    currentUserId: "mgr-1",
    role: "GERENTE" as const,
    store: {
      userId: "store", userName: "Tienda", role: "GERENTE" as const, avatar: "TI", photoUrl: null,
      sales: 15000, goal: 12000, achievement: 125, transactions: 60, pieces: 120,
      upt: 2, aur: 125, ept: 250, conversion: 20, traffic: 300, ranking: 0,
      grossSales: null, orkestraSales: null, orkestraTransactions: null, orkestraPieces: null,
      discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0, commissionMinimum: null
    },
    own: null,
    team: [{
      userId: "user-1", userName: "Juan Asesor", role: "ASESOR" as const, avatar: "JU", photoUrl: null,
      sales: 15000, goal: 12000, achievement: 125, transactions: 60, pieces: 120,
      upt: 2, aur: 125, ept: 250, conversion: 20, traffic: 300, ranking: 1,
      grossSales: null, orkestraSales: null, orkestraTransactions: null, orkestraPieces: null,
      discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0, commissionMinimum: null
    }],
    hasDiscountSource: false,
    latestDiscountWeek: null,
    commissionRules: []
  };
}

test("Daily Summary Cache - Flujo de negocio completo", async (t) => {
  const { ClarvexIntelligence, __setGetKpiReportForTests } = await import("../lib/clarvex-intelligence");
  const { resolveMonterreyDate } = await import("../lib/cron-time");
  __setGetKpiReportForTests(async (session) => buildMockReport(session.storeId) as any);

  const session = {
    userId: "mgr-1",
    storeId: "store-1",
    role: "GERENTE" as const,
    name: "Gerente Test",
    employeeNumber: "TEST-GER-1",
    platformAdmin: false
  };

  await t.test("1. Cálculo correcto del día anterior e inicialización de fechas", () => {
    const todayInfo = resolveMonterreyDate(new Date("2026-07-10T12:00:00Z"));
    assert.equal(todayInfo.dateKey, "2026-07-10");
    const yesterday = new Date(todayInfo.utcDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    assert.equal(yesterday.toISOString().slice(0, 10), "2026-07-09");
  });

  await t.test("2. Primera solicitud crea, ejecuta Gemini y guarda el resumen", async () => {
    mockSummaryDb.clear();
    const result = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09");
    assert.equal(result.status, "READY");
    assert.ok(result.content);
    const content = result.content as any;
    assert.equal(content.summary, "Cierre sólido de la tienda con buen desempeño general.");
  });

  await t.test("3. Segunda solicitud devuelve el mismo registro guardado sin re-invocar Gemini", async () => {
    const key = "store-1:2026-07-09T12:00:00.000Z";
    const cached = mockSummaryDb.get(key);
    assert.ok(cached);
    mockSummaryDb.set(key, {
      ...cached,
      content: { ...cached.content, summary: "Contenido de cache alterado" }
    });
    const secondCall = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09");
    assert.equal(secondCall.status, "READY");
    assert.equal((secondCall.content as any)?.summary, "Contenido de cache alterado");
  });

  await t.test("4. Caso sin datos del día anterior genera NO_DATA y no llama a Gemini", async () => {
    const noDataSession = { ...session, storeId: "store-no-data" };
    const result = await ClarvexIntelligence.generateDailySummary(noDataSession, "2026-07-09");
    assert.equal(result.status, "NO_DATA");
    assert.equal(result.content, null);
  });

  await t.test("4b. NO_DATA no queda congelado: reintenta y puede pasar a READY si ya hay KPIs", async () => {
    const key = "store-1:2026-07-09T12:00:00.000Z";
    mockSummaryDb.set(key, {
      id: "stale-no-data",
      storeId: "store-1",
      summaryDate: new Date("2026-07-09T12:00:00.000Z"),
      type: "STORE_DAILY",
      scopeKey: "STORE",
      status: "NO_DATA",
      content: null,
      metricsSnapshot: {},
      sourceDataHash: "",
      errorMessage: null,
      generatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const result = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09", false);
    assert.equal(result.status, "READY");
    assert.ok(result.content);
  });

  await t.test("4c. utcDayRange usa medianoche UTC (formato KPI)", async () => {
    const { utcDayRange } = await import("../lib/clarvex-intelligence");
    const range = utcDayRange("2026-07-09");
    assert.equal(range.start.toISOString(), "2026-07-09T00:00:00.000Z");
    assert.equal(range.end.toISOString(), "2026-07-10T00:00:00.000Z");
  });

  await t.test("5. Manejo seguro de fallos de Gemini registra FAILED en la BD", async () => {
    const originalCallGemini = (ClarvexIntelligence as any).callGemini;
    (ClarvexIntelligence as any).callGemini = async () => JSON.stringify({ summary: 1234 });
    mockSummaryDb.clear();
    const result = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09");
    assert.equal(result.status, "FAILED");
    assert.ok(result.errorMessage);
    (ClarvexIntelligence as any).callGemini = originalCallGemini;
  });

  await t.test("6. Cambio de mes/año funciona de forma segura mediante aritmética UTC", () => {
    const jan1 = resolveMonterreyDate(new Date("2026-01-01T12:00:00Z"));
    assert.equal(jan1.dateKey, "2026-01-01");
    const yesterdayJan = new Date(jan1.utcDate);
    yesterdayJan.setUTCDate(yesterdayJan.getUTCDate() - 1);
    assert.equal(yesterdayJan.toISOString().slice(0, 10), "2025-12-31");
  });

  __setGetKpiReportForTests(null);
});
