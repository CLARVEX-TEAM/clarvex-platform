import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

// Configurar variables de entorno requeridas por lib/prisma.ts antes de que sea cargado
(process.env as any).NODE_ENV = "test";
(process.env as any).ALLOW_INTEGRATION_TEST_DATABASE = "true";
(process.env as any).TEST_DATABASE_URL = "postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public";

// Configurar base de datos mock antes de cargar módulos de la aplicación
const mockSummaryDb = new Map<string, any>();
let geminiCallCount = 0;

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
        status: args.update.status || "PENDING",
        content: existing?.content || (args.update.content === Prisma.DbNull ? null : args.update.content) || null,
        metricsSnapshot: existing?.metricsSnapshot || null,
        sourceDataHash: existing?.sourceDataHash || null,
        errorMessage: null,
        generatedAt: null,
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
  kpi: {
    findMany: async (args: any) => {
      // Simular que para la tienda 2 no hay datos
      if (args.where.storeId === "store-no-data") {
        return [];
      }
      return [
        {
          id: "k-1",
          userId: "user-1",
          storeId: args.where.storeId,
          date: args.where.date,
          dailySales: 15000,
          dailyGoal: 12000,
          transactions: 60,
          pieces: 120,
          traffic: 300,
          upt: 2.0,
          conversion: 20.0,
          ranking: 1,
          user: { name: "Juan Asesor", role: "ASESOR" }
        }
      ];
    }
  },
  pending: {
    findMany: async () => []
  },
  auditLog: {
    create: async (args: any) => {
      return { id: `audit-${Math.random()}`, ...args.data };
    }
  }
};

(globalThis as any).prisma = mockPrisma;

// Mockear variables de entorno para pruebas seguras
(process.env as any).NODE_ENV = "test";
(process.env as any).MOCK_EXTERNAL_SERVICES = "true";

test("Daily Summary Cache - Flujo de negocio completo", async (t) => {
  const { ClarvexIntelligence } = await import("../lib/clarvex-intelligence");
  const { resolveMonterreyDate } = await import("../lib/cron-time");

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
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    assert.equal(yesterdayStr, "2026-07-09");
  });

  await t.test("2. Primera solicitud crea, ejecuta Gemini y guarda el resumen", async () => {
    mockSummaryDb.clear();
    const result = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09");

    assert.equal(result.status, "READY");
    assert.ok(result.content);
    const content = result.content as any;
    assert.equal(content.summary, "Cierre sólido de la tienda con buen desempeño general.");
    assert.equal(content.positives[0], "Se superó la meta diaria por un 10%");
  });

  await t.test("3. Segunda solicitud devuelve el mismo registro guardado sin re-invocar Gemini", async () => {
    // Al verificar el log interno, podemos mutar el contenido del caché para ver si nos devuelve el mutado en vez de regenerarlo
    const key = "store-1:2026-07-09T12:00:00.000Z";
    const cached = mockSummaryDb.get(key);
    assert.ok(cached);

    mockSummaryDb.set(key, {
      ...cached,
      content: {
        ...cached.content,
        summary: "Contenido de cache alterado"
      }
    });

    const secondCall = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09");
    assert.equal(secondCall.status, "READY");
    const secondContent = secondCall.content as any;
    assert.equal(secondContent?.summary, "Contenido de cache alterado");
  });

  await t.test("4. Caso sin datos del día anterior genera NO_DATA y no llama a Gemini", async () => {
    const noDataSession = { ...session, storeId: "store-no-data" };
    const result = await ClarvexIntelligence.generateDailySummary(noDataSession, "2026-07-09");

    assert.equal(result.status, "NO_DATA");
    assert.equal(result.content, null);
  });

  await t.test("5. Manejo seguro de fallos de Gemini registra FAILED en la BD", async () => {
    // Forzamos un fallo de Zod haciendo que Gemini devuelva un JSON malformado
    const originalCallGemini = (ClarvexIntelligence as any).callGemini;
    (ClarvexIntelligence as any).callGemini = async () => {
      return JSON.stringify({ summary: 1234 }); // summary es number en lugar de string (fallo de Zod)
    };

    mockSummaryDb.clear();
    const result = await ClarvexIntelligence.generateDailySummary(session, "2026-07-09");

    assert.equal(result.status, "FAILED");
    assert.ok(result.errorMessage);

    // Restaurar original
    (ClarvexIntelligence as any).callGemini = originalCallGemini;
  });

  await t.test("6. Cambio de mes/año funciona de forma segura mediante aritmética UTC", () => {
    // 1 de Enero de 2026 a las 12:00 UTC (6:00 AM local)
    const jan1 = resolveMonterreyDate(new Date("2026-01-01T12:00:00Z"));
    assert.equal(jan1.dateKey, "2026-01-01");
    const yesterdayJan = new Date(jan1.utcDate);
    yesterdayJan.setUTCDate(yesterdayJan.getUTCDate() - 1);
    
    assert.equal(yesterdayJan.toISOString().slice(0, 10), "2025-12-31"); // Cruce de año exitoso
  });
});
