import assert from "node:assert/strict";
import test from "node:test";

// Entorno de prueba seguro + modo mock ANTES de cargar cualquier módulo de la app.
(process.env as Record<string, string>).NODE_ENV = "test";
(process.env as Record<string, string>).ALLOW_INTEGRATION_TEST_DATABASE = "true";
(process.env as Record<string, string>).TEST_DATABASE_URL = "postgresql://clarvex:PASSWORD@localhost:5432/clarvex_test?schema=public";
(process.env as Record<string, string>).MOCK_EXTERNAL_SERVICES = "true";

// --- Mock Prisma -----------------------------------------------------------
let usageCreateCount = 0;
const proposals = new Map<string, any>();

const dailyRows = [{ dailyGoal: 12000, dailySales: 15000, transactions: 60, pieces: 120, traffic: 300 }];

const reportRows = ["adv-self", "adv-other"].map((userId) => ({
  id: `k-${userId}`,
  userId,
  date: new Date("2026-07-10T00:00:00.000Z"),
  dailySales: userId === "adv-self" ? 8000 : 5000,
  dailyGoal: 10000,
  monthlyGoal: 0,
  transactions: 30,
  pieces: 60,
  conversion: null,
  traffic: null,
  grossSales: null,
  orkestraSales: null,
  orkestraTransactions: null,
  orkestraPieces: null,
  discountAmount: null,
  discountLimit: null,
  commissionAmount: 0,
  commissionPercent: 0,
  commissionMinimum: null,
  user: { name: userId === "adv-self" ? "Yo Mismo" : "Otro Asesor", role: "ASESOR", photoUrl: null }
}));

const mockPrisma = {
  kpi: {
    findMany: async (args: any) => {
      if (args?.distinct?.includes?.("weekStart")) {
        return [{ weekNumber: 27, weekStart: new Date("2026-07-05T00:00:00.000Z"), weekEnd: new Date("2026-07-11T00:00:00.000Z") }];
      }
      if (args?.distinct?.includes?.("date")) return [];
      if (args?.include?.user) return reportRows;
      return dailyRows;
    },
    findFirst: async () => null
  },
  dataSource: { findFirst: async () => null },
  commissionRule: {
    findMany: async () => [
      { id: "r1", storeId: "store-1", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53, active: true },
      { id: "r2", storeId: "store-1", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91, active: true },
      { id: "r3", storeId: "store-1", role: "ASESOR", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29, active: true },
      { id: "r4", storeId: "store-1", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.25, active: true },
      { id: "r5", storeId: "store-1", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.56, active: true },
      { id: "r6", storeId: "store-1", role: "GERENTE", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 1.87, active: true },
      { id: "r7", storeId: "store-1", role: "SUBGERENTE", minSales: 0, maxSales: null, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93, active: true },
      { id: "r8", storeId: "store-1", role: "SUBGERENTE", minSales: 0, maxSales: null, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16, active: true },
      { id: "r9", storeId: "store-1", role: "SUBGERENTE", minSales: 0, maxSales: null, minAchievement: 115, maxAchievement: null, commissionPercent: 1.39, active: true }
    ]
  },
  schedule: { findMany: async () => [] },
  user: {
    findMany: async () => [{ id: "adv-self", name: "Yo Mismo", role: "ASESOR", photoUrl: null }],
    findFirst: async () => ({ id: "adv-self" })
  },
  pending: {
    findMany: async () => [
      { id: "p-1", title: "Revisar exhibición", description: "Antes de abrir", category: "COMERCIAL", priority: "ALTA", ownerId: "mgr-1", status: "PENDIENTE", dueDate: new Date("2026-07-10T00:00:00.000Z"), owner: { name: "Gerente" } }
    ]
  },
  announcement: {
    findMany: async () => [],
    create: async (args: any) => ({ id: "ann-1", ...args.data, createdAt: new Date(), reads: [] })
  },
  notification: { createMany: async () => ({ count: 0 }) },
  auditLog: { create: async (args: any) => ({ id: `audit-${Math.random()}`, ...args.data }) },
  aiRecommendationHistory: {
    create: async (args: any) => {
      const rec = { id: `prop-${proposals.size + 1}`, outcomeSuccess: null, createdAt: new Date(), ...args.data };
      proposals.set(rec.id, rec);
      return rec;
    },
    findFirst: async (args: any) => {
      const rec = proposals.get(args.where.id);
      if (!rec) return null;
      if (args.where.storeId && rec.storeId !== args.where.storeId) return null;
      return rec;
    },
    update: async (args: any) => {
      const rec = proposals.get(args.where.id);
      Object.assign(rec, args.data);
      return rec;
    }
  },
  aiUsageLog: {
    create: async (args: any) => {
      usageCreateCount++;
      return { id: `usage-${usageCreateCount}`, ...args.data };
    }
  },
  $transaction: async (fn: any) => fn(mockPrisma)
};

(globalThis as any).prisma = mockPrisma;

const managerCtx = { userId: "mgr-1", storeId: "store-1", role: "GERENTE" as const, name: "Gerente", platformAdmin: false, now: new Date("2026-07-10T12:00:00.000Z"), timeZone: "America/Mexico_City" };
const advisorCtx = { ...managerCtx, userId: "adv-self", role: "ASESOR" as const, name: "Asesor" };
const managerSession = { userId: "mgr-1", storeId: "store-1", role: "GERENTE" as const, name: "Gerente", employeeNumber: "TEST-GER-1", platformAdmin: false };

test("CLARVEX Copilot — Fase 1 (solo lectura)", async (t) => {
  const { selectModelTier, modelForTier } = await import("../lib/ai/models");
  const { selectTools, toolSchemas, executeTool } = await import("../lib/ai/tools/registry");
  const { MockProvider } = await import("../lib/ai/providers/mock-provider");
  const { getStoreDailyResultsTool } = await import("../lib/ai/tools/read/get-store-daily-results");
  const { getAdvisorPerformanceTool } = await import("../lib/ai/tools/read/get-advisor-performance");
  const { getCommissionsTool } = await import("../lib/ai/tools/read/get-commissions");
  const { getOpenPendingsTool } = await import("../lib/ai/tools/read/get-open-pendings");
  const { prepareAnnouncementDraftTool } = await import("../lib/ai/tools/draft/prepare-announcement-draft");
  const { proposeCreateAnnouncementTool } = await import("../lib/ai/tools/action/propose-create-announcement");
  const { confirmProposal } = await import("../lib/ai/actions");
  const { runCopilot } = await import("../lib/ai/orchestrator");

  await t.test("Selección de modelo por reglas", () => {
    assert.equal(selectModelTier("¿cómo voy hoy?"), "fast");
    assert.equal(selectModelTier("compara esta semana con la semana pasada"), "advanced");
    assert.equal(selectModelTier("x".repeat(400)), "advanced");
    assert.equal(modelForTier("fast"), "openai/gpt-oss-20b");
    assert.equal(modelForTier("advanced"), "openai/gpt-oss-120b");
  });

  await t.test("El registro expone 6 herramientas de lectura (ninguna mutante)", () => {
    const tools = selectTools(advisorCtx, 1);
    assert.equal(tools.length, 6);
    assert.ok(tools.every((tool) => tool.mutates === false));
    const schemas = toolSchemas(tools);
    assert.ok(schemas.every((schema) => typeof schema.name === "string" && typeof schema.parameters === "object"));
    assert.ok(schemas.some((schema) => schema.name === "getStoreDailyResults"));
    assert.ok(schemas.some((schema) => schema.name === "getCommissions"));
  });

  await t.test("executeTool rechaza herramienta desconocida y argumentos inválidos", async () => {
    const tools = selectTools(managerCtx, 1);
    const unknown = await executeTool(managerCtx, tools, "borrarTodo", "{}");
    assert.equal(unknown.ok, false);
    const badArgs = await executeTool(managerCtx, tools, "getStoreDailyResults", JSON.stringify({ date: "no-es-fecha" }));
    assert.equal(badArgs.ok, false);
  });

  await t.test("MockProvider simula el ciclo de tool-calling", async () => {
    const provider = new MockProvider();
    const tools = toolSchemas(selectTools(managerCtx, 1));
    const step1 = await provider.chatComplete({ model: "m", messages: [{ role: "user", content: "¿cómo vamos hoy?" }], tools });
    assert.equal(step1.toolCalls.length, 1);
    assert.equal(step1.toolCalls[0].name, "getStoreDailyResults");
    const step2 = await provider.chatComplete({ model: "m", messages: [{ role: "tool", toolCallId: "1", name: "getStoreDailyResults", content: JSON.stringify({ sales: 15000, goal: 12000 }) }], tools });
    assert.equal(step2.toolCalls.length, 0);
    assert.ok(step2.content && step2.content.includes("$"));
  });

  await t.test("getStoreDailyResults calcula alcance del día (gerencia = tienda)", async () => {
    const result = await getStoreDailyResultsTool.execute(managerCtx, {});
    assert.equal(result.ok, true);
    if (result.ok) {
      const data = result.data as { sales: number; goal: number; achievement: number; scope: string };
      assert.equal(data.sales, 15000);
      assert.equal(data.goal, 12000);
      assert.equal(data.achievement, 125);
      assert.equal(data.scope, "store");
    }
  });

  await t.test("SEGURIDAD: un asesor no puede consultar el desempeño de otro (userId ignorado)", async () => {
    const result = await getAdvisorPerformanceTool.execute(advisorCtx, { userId: "adv-other", period: "week", date: "2026-07-10" });
    assert.equal(result.ok, true);
    if (result.ok) {
      const data = result.data as { scope: string; advisor: { userId: string } | null };
      assert.equal(data.scope, "own");
      // Nunca devuelve al otro asesor.
      assert.notEqual(data.advisor?.userId, "adv-other");
    }
  });

  await t.test("getCommissions: gerencia ve tienda + equipo; asesor solo las suyas", async () => {
    const mgr = await getCommissionsTool.execute(managerCtx, { period: "month", date: "2026-07-10" });
    assert.equal(mgr.ok, true);
    if (mgr.ok) {
      const data = mgr.data as {
        scope: string;
        own: { commissionPercent: number; commissionAmount: number; hasMinimum: boolean };
        team: Array<{ userId: string; commissionAmount: number }>;
        activeRules: Array<{ role: string }>;
      };
      assert.equal(data.scope, "team");
      assert.equal(data.own.hasMinimum, true);
      assert.ok(data.own.commissionPercent > 0);
      assert.ok(data.team.length >= 2);
      assert.ok(data.activeRules.some((rule) => rule.role === "ASESOR"));
    }

    const adv = await getCommissionsTool.execute(advisorCtx, { period: "month", date: "2026-07-10", userId: "adv-other" });
    assert.equal(adv.ok, true);
    if (adv.ok) {
      const data = adv.data as { scope: string; own: { userId: string }; team?: unknown };
      assert.equal(data.scope, "own");
      assert.equal(data.own.userId, "adv-self");
      assert.equal(data.team, undefined);
    }
  });

  await t.test("MockProvider enruta preguntas de comisión a getCommissions", async () => {
    const provider = new MockProvider();
    const tools = toolSchemas(selectTools(managerCtx, 1));
    const step1 = await provider.chatComplete({
      model: "m",
      messages: [{ role: "user", content: "¿Quién está más cerca de comisionar o qué comisiones tenemos activas?" }],
      tools
    });
    assert.equal(step1.toolCalls.length, 1);
    assert.equal(step1.toolCalls[0].name, "getCommissions");
  });

  await t.test("getOpenPendings devuelve los pendientes de la tienda", async () => {
    const result = await getOpenPendingsTool.execute(managerCtx, {});
    assert.equal(result.ok, true);
    if (result.ok) {
      const data = result.data as { count: number; pendings: Array<{ title: string; owner: string }> };
      assert.equal(data.count, 1);
      assert.equal(data.pendings[0].title, "Revisar exhibición");
      assert.equal(data.pendings[0].owner, "Gerente");
    }
  });

  await t.test("FASE 2: los borradores solo se exponen a gerencia (nunca a asesor)", () => {
    const mgrTools = selectTools(managerCtx, 2);
    const advTools = selectTools(advisorCtx, 2);
    assert.equal(mgrTools.length, 9);
    assert.ok(mgrTools.some((tool) => tool.name === "prepareAnnouncementDraft"));
    // El asesor sigue con 6 herramientas de lectura: ningún borrador.
    assert.equal(advTools.length, 6);
    assert.ok(!advTools.some((tool) => tool.name.startsWith("prepare")));
    // Ninguna herramienta de borrador escribe en la BD.
    assert.ok(mgrTools.every((tool) => tool.mutates === false));
  });

  await t.test("FASE 2: prepareAnnouncementDraft entrega contexto real y se marca como borrador", async () => {
    const result = await prepareAnnouncementDraftTool.execute(managerCtx, { topic: "Cierre de mes" });
    assert.equal(result.ok, true);
    if (result.ok) {
      const data = result.data as { topic: string; isDraft: boolean; todayResults: unknown };
      assert.equal(data.topic, "Cierre de mes");
      assert.equal(data.isDraft, true);
      assert.ok(data.todayResults);
    }
  });

  await t.test("FASE 3: proponer NO ejecuta; confirmar SÍ (con aislamiento y anti-doble-ejecución)", async () => {
    // Gating: la acción solo existe en fase 3 y solo para gerencia.
    assert.ok(selectTools(managerCtx, 3).some((tool) => tool.name === "proposeCreateAnnouncement"));
    assert.ok(!selectTools(advisorCtx, 3).some((tool) => tool.name === "proposeCreateAnnouncement"));
    assert.ok(!selectTools(managerCtx, 2).some((tool) => tool.name === "proposeCreateAnnouncement"));

    // Proponer: registra una propuesta pendiente, NO publica.
    const proposeRes = await proposeCreateAnnouncementTool.execute(managerCtx, { title: "Cierre de mes", body: "Vamos con todo el fin de mes, equipo." });
    assert.equal(proposeRes.ok, true);
    if (!proposeRes.ok) return;
    const proposal = proposeRes.data as { requiresConfirmation: boolean; proposalId: string };
    assert.equal(proposal.requiresConfirmation, true);
    assert.ok(proposal.proposalId);

    // Otra tienda NO puede confirmar la propuesta.
    await assert.rejects(() => confirmProposal({ ...managerSession, storeId: "store-otra" }, proposal.proposalId), /no encontrada/i);

    // Confirmar: ejecuta la creación real del comunicado.
    const outcome = await confirmProposal(managerSession, proposal.proposalId);
    assert.equal(outcome.type, "ACTION_CREATE_ANNOUNCEMENT");
    assert.equal((outcome.result as { title: string }).title, "Cierre de mes");

    // Doble confirmación rechazada.
    await assert.rejects(() => confirmProposal(managerSession, proposal.proposalId), /ya fue procesada/i);
  });

  await t.test("Orquestador end-to-end: pregunta → herramienta → respuesta + telemetría", async () => {
    const before = usageCreateCount;
    const turn = await runCopilot(managerSession, { query: "¿cómo vamos hoy?" });
    assert.ok(turn.answer.includes("$"), `respuesta inesperada: ${turn.answer}`);
    assert.ok(turn.toolInvocations.some((invocation) => invocation.name === "getStoreDailyResults"));
    assert.equal(turn.provider, "mock");
    // Se registró el consumo de IA (telemetría).
    assert.equal(usageCreateCount, before + 1);
  });
});
