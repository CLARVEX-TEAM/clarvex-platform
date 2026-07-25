import { prisma } from "@/lib/prisma";
import { AI_CONFIG } from "@/lib/ai/config";
import { createProviderRouter } from "@/lib/ai/providers/provider-router";
import { isJsonGenerationFailure, parseModelJson } from "@/lib/ai/parse-model-json";
import { recordAiUsage } from "@/lib/ai/telemetry";
import type { Session } from "@/lib/session";
import { computeAchievements } from "@/lib/achievements";
import { computeDailyStreak } from "@/lib/streaks";
import { decodeSyncLogMessage } from "@/lib/data-source";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildRetailMonths, selectRetailMonth } from "@/lib/kpi-period";
import * as kpiService from "@/lib/services/kpi-service";
import type { KpiFacts } from "@/lib/services/kpi-service";
import { mergeRdvWeeks } from "@/lib/rdv-week";
import { z } from "zod";
import crypto from "crypto";
import { Prisma } from "@prisma/client";

/** Rango UTC [inicio, fin) del día KPI (medianoche). Los KPIs se guardan en T00:00Z. */
export function utcDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export { buildAiKpiSnapshot } from "@/lib/kpi-report";

type GetKpiReportFn = typeof kpiService.getKpiReport;
let getKpiReportForAi: GetKpiReportFn = (...args) => kpiService.getKpiReport(...args);

/** Solo tests: inyecta getKpiReport (misma fuente que la pestaña KPIs). */
export function __setGetKpiReportForTests(fn: GetKpiReportFn | null) {
  getKpiReportForAi = fn ? fn : (...args) => kpiService.getKpiReport(...args);
}

function formatPct(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function formatMoney(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `$${value.toFixed(2)}`;
}

function formatNum(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

/** Bloque de hechos KPIs para el prompt: la IA solo copia, no calcula. */
function renderKpiFactsBlock(label: string, facts: KpiFacts) {
  const store = facts.store;
  const teamLines = facts.team.map((item, index) =>
    `${index + 1}. ${item.name} | venta ${formatMoney(item.sales)} | meta ${formatMoney(item.goal)} | alcance ${formatPct(item.achievement)} | conv ${formatPct(item.conversion)} | UPT ${formatNum(item.upt)} | tickets ${item.transactions} | tráfico ${item.traffic ?? "—"}`
  );
  return `
### ${label}
Periodo: ${facts.startDate} → ${facts.endDate}${facts.weekNumber ? ` (semana ${facts.weekNumber})` : ""}${facts.retailMonthLabel ? ` | ${facts.retailMonthLabel}` : ""}
TIENDA:
- Venta: ${formatMoney(store?.sales)} | Meta: ${formatMoney(store?.goal)} | Alcance: ${formatPct(store?.achievement)}
- UPT: ${formatNum(store?.upt)} | AUR: ${formatMoney(store?.aur)} | EPT: ${formatMoney(store?.ept)}
- Tickets: ${store?.transactions ?? "—"} | Piezas: ${store?.pieces ?? "—"} | Tráfico: ${store?.traffic ?? "—"}
- Conversión tienda: ${formatPct(store?.conversion)}

ASESORES (ranking KPIs, ya calculado):
${teamLines.join("\n") || "(sin asesores)"}
`.trim();
}

export const DailySummaryContentSchema = z.object({
  summary: z.string().min(1).max(1500),
  positives: z.array(z.string().max(300)).max(10),
  negatives: z.array(z.string().max(300)).max(10),
  actionPlanTomorrow: z.array(z.string().max(300)).max(10),
});

export type DailySummaryContent = z.infer<typeof DailySummaryContentSchema>;

export const IaReportContentSchema = z.object({
  title: z.string().min(1),
  executiveSummary: z.string().min(1),
  performanceAnalysis: z.string().min(1),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  strategicRecommendations: z.array(z.string()).min(1)
});

export type IaReportContent = z.infer<typeof IaReportContentSchema>;

export class ClarvexIntelligence {
  private static async callGemini(prompt: string, jsonMode = true, usageMeta?: { storeId: string; userId?: string | null; feature: string }): Promise<string> {
    if (process.env.NODE_ENV === "test" || process.env.MOCK_EXTERNAL_SERVICES === "true") {
      const p = prompt.toLowerCase();
      if (p.includes("actionplantomorrow") || p.includes("positives") || p.includes("resumen diario")) {
        return JSON.stringify({
          summary: "Cierre sólido de la tienda con buen desempeño general.",
          positives: ["Se superó la meta diaria por un 10%", "Excelente conversión del 15%"],
          negatives: ["UPT de 1.8 por debajo del objetivo de 2.0"],
          actionPlanTomorrow: ["Enfocarse en ofrecer calzado deportivo", "Asegurar cobertura en horas pico"]
        });
      }
      if (p.includes("advisor") || p.includes("coaching") || p.includes("asesor")) {
        return JSON.stringify({
          techniques: ["Ofrecer producto adicional al cierre", "Escucha activa"],
          productsToPush: "Playera Polo Test",
          weakestKpi: { name: "UPT", details: "El promedio de unidades por ticket es bajo" },
          coachingTip: "Sigue ofreciendo artículos complementarios en caja."
        });
      }
      if (p.includes("plan") || p.includes("daily") || p.includes("diario")) {
        return JSON.stringify({
          summary: "Plan de ventas del día enfocado en UPT",
          focus: "Promoción de accesorios",
          actions: ["Ofrecer calcetines en cada compra de calzado", "Saludar al cliente en los primeros 10 segundos"]
        });
      }
      if (p.includes("predict") || p.includes("projection") || p.includes("pronóstico")) {
        return JSON.stringify({
          probabilityGoal: 85.5,
          expectedCloseSales: 120000,
          salesPerHourNeeded: 1200,
          details: "Pronóstico simulado en entorno de pruebas"
        });
      }
      if (p.includes("strategicrecommendations") || p.includes("informe") && p.includes("retail")) {
        return JSON.stringify({
          title: "Reporte semanal de desempeño",
          executiveSummary: "La tienda mantiene ritmo comercial estable en el periodo.",
          performanceAnalysis: "El equipo cumple metas parciales con oportunidad en conversión.",
          strengths: ["Buen ticket promedio", "Ranking equilibrado"],
          weaknesses: ["Conversión por debajo del objetivo"],
          strategicRecommendations: ["Reforzar cierre en piso", "Coaching en UPT"]
        });
      }
      if (p.includes("storehealth") || p.includes("fortheleses")) {
        return JSON.stringify({
          storeHealth: "VERDE",
          fortheleses: ["Buen alcance semanal"],
          risks: ["Conversión mejorable"],
          topAdvisor: "Ana",
          opportunityAdvisor: "Luis",
          priorities: ["Cerrar pendientes"],
          actions: ["Coaching UPT"]
        });
      }
      return jsonMode ? JSON.stringify({ message: "Respuesta mock de IA", success: true }) : "Texto mock de IA";
    }

    // El transporte real ahora pasa por la abstracción de proveedor (Groq como
    // principal, con fallback a Cloudflare). Se mantiene el nombre callGemini y
    // el bloque mock de arriba por compatibilidad interna y con los tests.
    const startedAt = Date.now();
    const router = createProviderRouter();

    const runChat = (useJsonMode: boolean) =>
      router.chatComplete({
        model: AI_CONFIG.models.advanced,
        messages: useJsonMode
          ? [
              { role: "system", content: "Responde únicamente con un objeto JSON válido. Sin markdown ni texto fuera del JSON." },
              { role: "user", content: prompt }
            ]
          : [{ role: "user", content: `${prompt}\n\nResponde SOLO con el objeto JSON solicitado, sin texto adicional.` }],
        temperature: useJsonMode ? 0.4 : 0.5,
        jsonMode: useJsonMode && jsonMode
      });

    try {
      let result;
      try {
        result = await runChat(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!jsonMode || !isJsonGenerationFailure(message)) throw error;
        result = await runChat(false);
      }

      const text = result.content;
      if (!text) {
        throw new Error("No se recibió respuesta válida del modelo de IA.");
      }
      if (usageMeta) {
        await recordAiUsage({
          storeId: usageMeta.storeId,
          userId: usageMeta.userId ?? null,
          feature: usageMeta.feature,
          provider: result.provider,
          model: result.model,
          modelTier: "advanced",
          usage: result.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          toolCalls: 0,
          iterations: 1,
          latencyMs: Date.now() - startedAt,
          status: "success"
        });
      }
      return text.trim();
    } catch (error) {
      if (usageMeta) {
        await recordAiUsage({
          storeId: usageMeta.storeId,
          userId: usageMeta.userId ?? null,
          feature: usageMeta.feature,
          provider: AI_CONFIG.provider,
          model: AI_CONFIG.models.advanced,
          modelTier: "advanced",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          toolCalls: 0,
          iterations: 1,
          latencyMs: Date.now() - startedAt,
          status: "error",
          errorMessage: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  }

  /**
   * Plan del Día IA - Customized Daily Plan with AI memory persistence to prevent repetition.
   */
  public static async generateDailyPlan(session: Session, userId: string, dateStr: string) {
    const parsedDate = new Date(`${dateStr}T12:00:00.000Z`);

    // 1. Load context
    const [targetUser, userKpis, pendingTasks, weekPlans, storeLog, feedbackMemory] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.kpi.findMany({
        where: { userId, date: { lte: parsedDate } },
        orderBy: { date: "desc" },
        take: 10,
      }),
      prisma.pending.findMany({
        where: { storeId: session.storeId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
        take: 15,
      }),
      prisma.aiPlanHistory.findMany({
        where: { userId, date: { gte: new Date(parsedDate.getTime() - 7 * 24 * 60 * 60 * 1000) } },
        select: { activities: true },
      }),
      prisma.storeLog.findMany({
        where: { storeId: session.storeId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.aiMemory.findUnique({
        where: { storeId_userId_key: { storeId: session.storeId, userId, key: `advisor_feedback_${userId}` } },
      }),
    ]);

    if (!targetUser) throw new Error("Colaborador no encontrado.");

    const feedback = feedbackMemory ? JSON.parse(feedbackMemory.content) : { successes: [], failures: [] };

    const kpiSummary = userKpis.map((k) => ({
      date: k.date.toISOString().slice(0, 10),
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
      conversion: k.conversion ? Number(k.conversion) : null,
      upt: Number(k.upt),
      avgTicket: Number(k.avgTicket),
    }));

    const recentActivities = Array.from(new Set(weekPlans.flatMap((p) => p.activities)));
    const tasks = pendingTasks.map((t) => `${t.title} (${t.priority})`);
    const logs = storeLog.map((l) => `${l.category}: ${l.description}`);

    const prompt = `
Eres un consultor experto en operaciones de retail y analista de tiendas. Tu objetivo es proponer el "Plan del Día" estratégico y personalizado para el asesor ${targetUser.name}.
Analiza sus métricas recientes de KPIs, tareas pendientes, las actividades ya asignadas recientemente para no repetirlas, y el aprendizaje de qué estrategias funcionaron antes.

Métricas recientes de ${targetUser.name}:
${JSON.stringify(kpiSummary, null, 2)}

Estrategias anteriores y su impacto (¡Aprendizaje IA!):
- Exitosas (cumplieron meta): ${JSON.stringify(feedback.successes)}
- Fallidas (no cumplieron meta): ${JSON.stringify(feedback.failures)}

Pendientes de la tienda:
${tasks.join(", ") || "Ninguno"}

Últimas notas en bitácora de tienda:
${logs.join("\n") || "Ninguna"}

ACTIVIDADES YA ASIGNADAS ESTA SEMANA (¡EVITA REPETIRLAS!):
${recentActivities.length > 0 ? recentActivities.join("\n") : "Ninguna"}

Genera un plan con:
1. Objetivo principal
2. Objetivos específicos (comercial, servicio, conversión, UPT, AUR, EPT)
3. 3 actividades comerciales (enfocadas en sus KPIs más débiles, por ejemplo, si conversión es baja, sugiere abordaje inicial rápido. Si UPT es bajo, sugiere venta cruzada de accesorios).
4. 2 actividades operativas (limpieza, acomodo, etiquetado).
5. 1 actividad de servicio (acompañamiento al probador, cobro sugerido).
6. 1 actividad de capacitación (revisión de técnicas de cobro o material de tienda).
7. Mensaje motivacional.
8. Consejo personalizado.

Debes responder estrictamente en formato JSON utilizando el siguiente esquema:
{
  "focus": "string (Objetivo principal del día)",
  "message": "string (Mensaje motivacional personalizado)",
  "objectives": {
    "comercial": "string",
    "servicio": "string",
    "conversion": "string",
    "upt": "string",
    "aur": "string",
    "ept": "string"
  },
  "activities": {
    "comerciales": ["string", "string", "string"],
    "operativas": ["string", "string"],
    "servicio": ["string"],
    "capacitacion": ["string"]
  },
  "advice": "string (Consejo personalizado)"
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "daily-plan" });
    const planResult = JSON.parse(generatedText);

    // Save in history to update memory
    const allActivities = [
      ...planResult.activities.comerciales,
      ...planResult.activities.operativas,
      ...planResult.activities.servicio,
      ...planResult.activities.capacitacion,
    ];

    await prisma.aiPlanHistory.create({
      data: {
        storeId: session.storeId,
        userId,
        date: parsedDate,
        kpisUsed: JSON.stringify(kpiSummary),
        focus: planResult.focus,
        message: planResult.message,
        activities: allActivities,
      },
    });

    return planResult;
  }

  /**
   * Coach IA - Detailed Strengths, Weaknesses, and Coaching recommendations for an advisor.
   */
  public static async getAdvisorProfile(session: Session, userId: string) {
    // El sufijo de versión invalida el caché cuando cambia el prompt. Sin él, los
    // perfiles ya guardados (algunos generados en inglés) seguirían mostrándose
    // hasta 3 días. Súbelo cada vez que cambie el prompt de este coach.
    const memoryKey = `advisor_profile_v2_${userId}`;

    // 1. Check if cached in memory in the last 3 days
    const cachedMemory = await prisma.aiMemory.findUnique({
      where: { storeId_userId_key: { storeId: session.storeId, userId, key: memoryKey } },
    });

    if (cachedMemory) {
      const parsed = JSON.parse(cachedMemory.content);
      const isFresh = new Date().getTime() - new Date(cachedMemory.updatedAt).getTime() < 3 * 24 * 60 * 60 * 1000;
      if (isFresh) {
        return parsed;
      }
    }

    // 2. Fetch fresh context
    const [user, kpis] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.kpi.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 15,
      }),
    ]);

    if (!user) throw new Error("Usuario no encontrado.");

    const kpiSummary = kpis.map((k) => ({
      date: k.date.toISOString().slice(0, 10),
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
      conversion: k.conversion ? Number(k.conversion) : null,
      upt: Number(k.upt),
      avgTicket: Number(k.avgTicket),
      ranking: k.ranking,
    }));

    // Compute achievements and streaks from existing helper modules
    const streakRows = kpis.map((k) => ({
      date: k.date.toISOString().slice(0, 10),
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
    }));
    const todayStr = new Date().toISOString().slice(0, 10);
    const streakResult = computeDailyStreak(streakRows, todayStr);
    const achievements = computeAchievements({
      userKpis: kpis.map((k) => ({
        date: k.date.toISOString().slice(0, 10),
        dailySales: Number(k.dailySales),
        dailyGoal: Number(k.dailyGoal),
        monthlySales: Number(k.monthlySales),
        monthlyGoal: Number(k.monthlyGoal),
        upt: Number(k.upt),
        ranking: k.ranking,
      })),
      todayKey: todayStr,
      streakBest: streakResult.best,
    });

    const prompt = `
Eres un coach de ventas experto en retail. Analiza el historial de rendimiento, las metas y los logros de ${user.name} para crear un perfil de coaching exhaustivo.

Historial de rendimiento:
${JSON.stringify(kpiSummary, null, 2)}

Racha actual de metas cumplidas: ${streakResult.current} días (Mejor racha histórica: ${streakResult.best} días).
Logros desbloqueados: ${achievements.filter((a) => a.unlocked).map((a) => a.title).join(", ")}.

Genera un perfil con:
1. Fortalezas principales
2. Oportunidades de mejora
3. KPI más fuerte e interpretación
4. KPI más débil e interpretación
5. 3 técnicas de venta específicas para mejorar su desempeño
6. Recomendación de productos a impulsar
7. Nivel de riesgo operacional (Bajo, Medio, Alto) con justificación.

IDIOMA: escribe TODOS los textos en español de México, dirigiéndote al asesor de
tú. Las claves del JSON van en inglés tal como aparecen abajo, pero ni un solo
valor puede salir en inglés: es lo que lee el asesor en la app.

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "strongestKpi": { "name": "string", "details": "string" },
  "weakestKpi": { "name": "string", "details": "string" },
  "techniques": ["string", "string", "string"],
  "productsToPush": "string",
  "operationalRisk": { "level": "Bajo | Medio | Alto", "reason": "string" }
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "coach" });
    const parsedResult = JSON.parse(generatedText);

    // Suggest actual training resources based on weak KPI
    let recommendedResources: Array<{ id: string; title: string }> = [];
    try {
      const weakKpiName = parsedResult.weakestKpi?.name?.toLowerCase() || "";
      const category = weakKpiName.includes("convers") || weakKpiName.includes("ticket")
        ? "VENTAS"
        : weakKpiName.includes("servicio") || weakKpiName.includes("upt")
        ? "ATENCION"
        : "VENTAS";

      recommendedResources = await prisma.trainingResource.findMany({
        where: { storeId: session.storeId, category },
        select: { id: true, title: true },
        take: 2,
      });
    } catch (e) {
      console.error("[Training Recommendations Error]:", e);
    }
    parsedResult.recommendedResources = recommendedResources;

    // Save in memory cache
    await prisma.aiMemory.upsert({
      where: { storeId_userId_key: { storeId: session.storeId, userId, key: memoryKey } },
      update: { content: JSON.stringify(parsedResult) },
      create: {
        storeId: session.storeId,
        userId,
        key: memoryKey,
        content: JSON.stringify(parsedResult),
      },
    });

    return parsedResult;
  }

  /**
   * Dashboard Ejecutivo IA — números 100% desde getKpiReport (misma fuente que
   * la pestaña KPIs). La IA solo narra; no calcula conversión ni alcances.
   */
  public static async getExecutiveHealth(session: Session) {
    const todayInfo = resolveMonterreyDate();
    const today = todayInfo.utcDate;
    const todayKey = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    // Semana/mes: misma llamada que /api/kpis (selectedDate=hoy, sin asOfDate).
    // Día: solo ayer (el día de hoy suele ir en $0 y no aporta al resumen operativo).
    const [monthReport, weekReport, dayReport, pendings, logs] = await Promise.all([
      getKpiReportForAi(session, { period: "month", selectedDate: today }),
      getKpiReportForAi(session, { period: "week", selectedDate: today }),
      getKpiReportForAi(session, { period: "week", selectedDate: yesterday, dayOnly: true }),
      prisma.pending.findMany({
        where: { storeId: session.storeId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      }),
      prisma.storeLog.findMany({
        where: { storeId: session.storeId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const monthFacts = kpiService.kpiFactsFromReport(monthReport);
    const weekFacts = kpiService.kpiFactsFromReport(weekReport);
    const dayFacts = kpiService.kpiFactsFromReport(dayReport);

    const advisors = weekFacts.team;
    const topAdvisor = advisors[0]
      ? `${advisors[0].name} (alcance ${formatPct(advisors[0].achievement)}, conv ${formatPct(advisors[0].conversion)})`
      : "Sin asesores con datos en la semana KPIs";
    const opportunityAdvisor = advisors.length
      ? `${advisors[advisors.length - 1].name} (alcance ${formatPct(advisors[advisors.length - 1].achievement)}, conv ${formatPct(advisors[advisors.length - 1].conversion)})`
      : "Sin asesores con datos en la semana KPIs";

    const tasks = pendings.map((t) => `${t.title} (${t.priority})`);
    const logsSummary = logs.map((l) => `${l.category}: ${l.description}`);

    const prompt = `
Eres un auditor de operaciones retail. Redacta un diagnóstico CUALITATIVO.
Los números YA vienen de la pestaña KPIs (getKpiReport). PROHIBIDO recalcular, inventar o redondear distinto.

Semana y mes = mismos totales que la pestaña KPIs con fecha ${todayKey} (semana/mes retail completo, sin cortar a ayer).
Día = solo ${yesterdayKey} (ayer). No inventes ventas del día de hoy.

${renderKpiFactsBlock("MES retail (igual que pestaña KPIs)", monthFacts)}

${renderKpiFactsBlock("SEMANA retail (igual que Ranking / pestaña KPIs)", weekFacts)}

${renderKpiFactsBlock(`DÍA ${yesterdayKey}`, dayFacts)}

Destacado precalculado (semana): ${topAdvisor}
Oportunidad precalculada (semana): ${opportunityAdvisor}

Pendientes activos: ${tasks.join(", ") || "Ninguno"}
Bitácora reciente:
${logsSummary.join("\n") || "Ninguna"}

Reglas estrictas:
1. Si citas un %, venta, UPT o conversión, cópialo EXACTO del bloque de hechos.
2. topAdvisor y opportunityAdvisor: solo asesores del ranking semanal de arriba.
3. No culpes a gerencia por ventas personales en 0.
4. Prioriza acciones concretas ligadas a pendientes y a la conversión/alcance de la semana.

Responde estrictamente en JSON:
{
  "storeHealth": "VERDE | AMARILLO | ROJO",
  "fortheleses": ["string", "string"],
  "risks": ["string", "string"],
  "topAdvisor": "string",
  "opportunityAdvisor": "string",
  "priorities": ["string", "string"],
  "actions": ["string", "string"]
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "executive" });
    const narrative = JSON.parse(generatedText) as {
      storeHealth: string;
      fortheleses: string[];
      risks: string[];
      topAdvisor: string;
      opportunityAdvisor: string;
      priorities: string[];
      actions: string[];
    };

    return {
      ...narrative,
      // Hechos numéricos para la UI (no pasan por el modelo).
      kpiFacts: {
        asOf: todayKey,
        dayAsOf: yesterdayKey,
        month: monthFacts,
        week: weekFacts,
        day: dayFacts
      }
    };
  }

  /**
   * AI Task Optimization - Group, prioritize, merge, and assign candidates for tasks.
   */
  public static async optimizeTasks(session: Session) {
    const [pendings, users] = await Promise.all([
      prisma.pending.findMany({
        where: { storeId: session.storeId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      }),
      prisma.user.findMany({
        where: { storeId: session.storeId, active: true },
        select: { id: true, name: true, role: true },
      }),
    ]);

    if (pendings.length === 0) {
      return {
        prioritizedTasks: [],
        duplicates: [],
        suggestions: [],
      };
    }

    const taskList = pendings.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      priority: p.priority,
      dueDate: p.dueDate.toISOString().slice(0, 10),
    }));

    const advisorList = users.map((u) => ({ id: u.id, name: u.name, role: u.role }));

    const prompt = `
Eres un director de proyectos de retail. Analiza la lista de pendientes operativos y la lista de colaboradores disponibles de la tienda para optimizar la carga de trabajo.

Lista de pendientes:
${JSON.stringify(taskList, null, 2)}

Colaboradores disponibles:
${JSON.stringify(advisorList, null, 2)}

Identifica:
1. Prioridades recomendadas basadas en urgencia e impacto en tienda.
2. Posibles tareas duplicadas o muy similares que deberían fusionarse.
3. Recomendación de asignación de responsables idóneos según la naturaleza de la tarea.

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "prioritizedTasks": [
    { "id": "string (id de la tarea)", "justification": "string (por qué tiene alta prioridad)" }
  ],
  "duplicates": [
    { "taskIds": ["string", "string"], "suggestedTitle": "string (título unificado sugerido)" }
  ],
  "suggestions": [
    { "taskId": "string", "recommendedOwnerId": "string", "recommendedOwnerName": "string", "reason": "string" }
  ]
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "tasks-optimize" });
    return JSON.parse(generatedText);
  }

  /**
   * AI Announcement Generator
   */
  public static async generateAnnouncement(session: Session, promptText: string): Promise<{ title: string; body: string }> {
    const prompt = `
Eres un encargado de comunicación corporativa para tiendas de retail.
A partir de la siguiente idea o descripción breve, redacta un comunicado profesional, claro, motivador y bien formateado para el equipo de tienda.

Idea o tema:
"${promptText}"

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "title": "string (Título atractivo y profesional del comunicado)",
  "body": "string (Contenido completo del comunicado. Usa saltos de línea \\n para dar formato limpio)"
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "announcement" });
    return JSON.parse(generatedText);
  }

  /**
   * Resumen Diario IA - Generates an executive daily report summarizing sales, KPIs, rankings, and pending tasks.
   */
  public static async generateDailySummary(session: Session, dateStr: string, forceRegenerate = false) {
    // Clave de caché (mediodía) — se mantiene por compatibilidad con registros existentes.
    const summaryDate = new Date(`${dateStr}T12:00:00.000Z`);

    // 1. Intentar cargar el caché existente
    let summaryRecord = await prisma.aiDailySummary.findUnique({
      where: {
        storeId_summaryDate_type_scopeKey: {
          storeId: session.storeId,
          summaryDate,
          type: "STORE_DAILY",
          scopeKey: "STORE"
        }
      }
    });

    if (summaryRecord && !forceRegenerate) {
      if (summaryRecord.status === "PENDING") {
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          summaryRecord = await prisma.aiDailySummary.findUnique({
            where: {
              storeId_summaryDate_type_scopeKey: {
                storeId: session.storeId,
                summaryDate,
                type: "STORE_DAILY",
                scopeKey: "STORE"
              }
            }
          });
          if (summaryRecord && summaryRecord.status !== "PENDING") break;
        }
      }

      // FAILED se sirve de caché hasta regeneración manual.
      // READY se valida más abajo con sourceDataHash (corrige conversiones viejas).
      // NO_DATA se reintenta: el sync del RDV puede haber llegado después.
      if (summaryRecord?.status === "FAILED") return summaryRecord;
    }

    // 2. Fuente de verdad = getKpiReport (misma que pestaña KPIs), día exacto.
    const dayUtc = new Date(`${dateStr}T00:00:00.000Z`);
    const [dayReport, pendings] = await Promise.all([
      getKpiReportForAi(session, { period: "week", selectedDate: dayUtc, dayOnly: true }),
      prisma.pending.findMany({ where: { storeId: session.storeId } })
    ]);
    const dayFacts = kpiService.kpiFactsFromReport(dayReport);
    const store = dayFacts.store;
    const salesTotal = store?.sales ?? 0;
    const goalTotal = store?.goal ?? 0;

    if (!store || (salesTotal === 0 && goalTotal === 0)) {
      summaryRecord = await prisma.aiDailySummary.upsert({
        where: {
          storeId_summaryDate_type_scopeKey: {
            storeId: session.storeId,
            summaryDate,
            type: "STORE_DAILY",
            scopeKey: "STORE"
          }
        },
        update: {
          status: "NO_DATA",
          content: Prisma.DbNull,
          metricsSnapshot: {},
          sourceDataHash: "",
          errorMessage: null,
          generatedAt: new Date()
        },
        create: {
          storeId: session.storeId,
          summaryDate,
          type: "STORE_DAILY",
          scopeKey: "STORE",
          status: "NO_DATA",
          metricsSnapshot: {},
          sourceDataHash: "",
          generatedAt: new Date()
        }
      });
      return summaryRecord;
    }

    // 3. Hechos KPIs — la IA no calcula nada de esto.
    const ticketsTotal = store.transactions;
    const piecesTotal = store.pieces;
    const trafficTotal = store.traffic ?? 0;
    const storeReach = store.achievement;
    const storeDiff = salesTotal - goalTotal;
    const storeUpt = store.upt ?? 0;
    const storeAur = store.aur ?? 0;
    const storeEpt = store.ept ?? 0;
    const storeConversion = store.conversion ?? 0;

    const advisors = dayFacts.team.map((advisor) => ({
      name: advisor.name,
      role: advisor.role,
      sales: advisor.sales,
      goal: advisor.goal,
      achievement: advisor.achievement,
      upt: advisor.upt,
      conversion: advisor.conversion,
      ranking: advisor.ranking
    }));

    const topAdvisor = advisors[0]
      ? `${advisors[0].name} (alcance ${formatPct(advisors[0].achievement)}, conv ${formatPct(advisors[0].conversion)})`
      : "Ninguno";
    const opportunityAdvisor = advisors.length
      ? `${advisors[advisors.length - 1].name} (alcance ${formatPct(advisors[advisors.length - 1].achievement)}, conv ${formatPct(advisors[advisors.length - 1].conversion)})`
      : "Ninguno";

    const pendingList = pendings.map((p) => `${p.title} (Estado: ${p.status}, Prioridad: ${p.priority})`);

    const metricsSnapshot = {
      source: "getKpiReport",
      kpiFacts: dayFacts,
      storeSales: salesTotal,
      storeGoal: goalTotal,
      storeReach,
      storeDiff,
      storeUpt,
      storeAur,
      storeEpt,
      storeConversion,
      storeTraffic: trafficTotal,
      topAdvisor,
      opportunityAdvisor,
      advisors,
      pendingCount: pendingList.length
    };

    const normalizedSnapshotStr = JSON.stringify({
      source: "getKpiReport/v1",
      storeSales: Number(salesTotal).toFixed(2),
      storeGoal: Number(goalTotal).toFixed(2),
      storeConversion: storeConversion === null || storeConversion === undefined ? null : Number(storeConversion).toFixed(2),
      storeTraffic: Number(trafficTotal),
      topAdvisor,
      opportunityAdvisor,
      advisors: advisors.map((a) => ({
        name: a.name,
        sales: a.sales.toFixed(2),
        goal: a.goal.toFixed(2),
        conversion: a.conversion === null || a.conversion === undefined ? null : Number(a.conversion).toFixed(2)
      }))
    });
    const sourceDataHash = crypto.createHash("sha256").update(normalizedSnapshotStr).digest("hex");

    if (
      !forceRegenerate &&
      summaryRecord?.status === "READY" &&
      summaryRecord.sourceDataHash === sourceDataHash
    ) {
      return summaryRecord;
    }

    // 4. Adquirir el bloqueo / marcar PENDING antes de llamar a la IA
    try {
      summaryRecord = await prisma.aiDailySummary.upsert({
        where: {
          storeId_summaryDate_type_scopeKey: {
            storeId: session.storeId,
            summaryDate,
            type: "STORE_DAILY",
            scopeKey: "STORE"
          }
        },
        update: {
          status: "PENDING",
          errorMessage: null,
          content: Prisma.DbNull,
          generatedAt: null
        },
        create: {
          storeId: session.storeId,
          summaryDate,
          type: "STORE_DAILY",
          scopeKey: "STORE",
          status: "PENDING"
        }
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          summaryRecord = await prisma.aiDailySummary.findUnique({
            where: {
              storeId_summaryDate_type_scopeKey: {
                storeId: session.storeId,
                summaryDate,
                type: "STORE_DAILY",
                scopeKey: "STORE"
              }
            }
          });
          if (summaryRecord && summaryRecord.status !== "PENDING") {
            return summaryRecord;
          }
        }
        throw new Error("El resumen está siendo generado por otro proceso. Intente de nuevo.");
      }
      throw err;
    }

    const prompt = `
Eres un gerente regional de Clarvex. Redacta el resumen del día ${dateStr}.
TODOS los números salen de getKpiReport (pestaña KPIs). PROHIBIDO recalcular o inventar %.

${renderKpiFactsBlock(`DÍA ${dateStr}`, dayFacts)}

Destacado: ${topAdvisor}
Oportunidad: ${opportunityAdvisor}
Pendientes: ${JSON.stringify(pendingList)}

Instrucciones:
1. Narra el día con tono ejecutivo (3-5 oraciones en summary).
2. positives / negatives / actionPlanTomorrow: concretos.
3. Si mencionas conversión, alcance, UPT o montos, cópialos EXACTOS del bloque de hechos.
4. Solo asesores en ranking; no trates a gerencia como vendedor de piso.

JSON estricto:
{
  "summary": "string",
  "positives": ["string"],
  "negatives": ["string"],
  "actionPlanTomorrow": ["string"]
}
`;

    // 5. Invocar y Validar respuesta
    let attempt = 0;
    let validatedContent: DailySummaryContent | null = null;
    let geminiErrorMsg = "";

    while (attempt < 2 && !validatedContent) {
      try {
        const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "daily-summary" });
        const parsed = JSON.parse(generatedText);
        validatedContent = DailySummaryContentSchema.parse(parsed);
      } catch (err: any) {
        attempt++;
        geminiErrorMsg = err.message || String(err);
        if (attempt < 2) {
          console.warn(`[Gemini Validation Failed] Intento ${attempt} fallido. Reintentando...`, err);
        }
      }
    }

    if (validatedContent) {
      return await prisma.aiDailySummary.update({
        where: { id: summaryRecord.id },
        data: {
          status: "READY",
          content: validatedContent as any,
          metricsSnapshot: metricsSnapshot as any,
          sourceDataHash,
          errorMessage: null,
          generatedAt: new Date()
        }
      });
    }

    return await prisma.aiDailySummary.update({
      where: { id: summaryRecord.id },
      data: {
        status: "FAILED",
        errorMessage: geminiErrorMsg || "Error al validar la estructura JSON de la respuesta de Gemini.",
        metricsSnapshot: metricsSnapshot as any,
        sourceDataHash,
        generatedAt: new Date()
      }
    });
  }

  /**
   * Reportes IA - Generates daily, weekly, or monthly analytical performance reports.
   */
  public static async generateIaReport(session: Session, type: "DAILY" | "WEEKLY" | "MONTHLY", startStr: string, endStr: string) {
    // Números 100% desde getKpiReport (misma fuente que la pestaña KPIs). La IA
    // solo redacta el informe; no recalcula ventas, metas, alcances ni conversión.
    const period = type === "MONTHLY" ? "month" : "week";
    const dayOnly = type === "DAILY";
    const selectedDate = new Date(`${endStr}T00:00:00.000Z`);

    const [report, store] = await Promise.all([
      getKpiReportForAi(session, { period, selectedDate, dayOnly }),
      prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } }),
    ]);
    const facts = kpiService.kpiFactsFromReport(report);

    const periodLabel = type === "WEEKLY" ? "semanal" : type === "MONTHLY" ? "mensual" : "diario";
    const prompt = `Genera un informe ${periodLabel} de retail para la tienda "${store?.name ?? "Tienda"}" (${startStr} a ${endStr}).

DATOS (no recalcules; cita solo estos números):
${renderKpiFactsBlock(`Periodo ${type}`, facts)}

Devuelve un JSON con exactamente estas claves en español:
title, executiveSummary, performanceAnalysis, strengths (array de 2-4 strings), weaknesses (array de 2-4 strings), strategicRecommendations (array de 2-4 strings).

Ejemplo de forma (no copies el texto, solo la estructura):
{"title":"...","executiveSummary":"...","performanceAnalysis":"...","strengths":["..."],"weaknesses":["..."],"strategicRecommendations":["..."]}`;
    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "report" });
    const parsed = parseModelJson(generatedText);
    const validated = IaReportContentSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error("El modelo devolvió un reporte incompleto. Intenta de nuevo.");
    }
    return validated.data;
  }

  /**
   * Aprendizaje Operativo - Evaluates historical daily plans outcomes based on actual end-of-day sales data.
   */
  public static async evaluatePlanOutcomes(storeId: string) {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const plans = await prisma.aiPlanHistory.findMany({
      where: {
        storeId,
        date: { gte: cutoffDate },
        outcomeSuccess: null,
      },
    });

    if (plans.length === 0) return { evaluated: 0 };

    let count = 0;
    for (const plan of plans) {
      const kpi = await prisma.kpi.findFirst({
        where: {
          userId: plan.userId,
          date: plan.date,
        },
      });

      if (kpi) {
        const sales = Number(kpi.dailySales);
        const goal = Number(kpi.dailyGoal);
        const success = goal > 0 ? sales >= goal : sales > 0;

        await prisma.aiPlanHistory.update({
          where: { id: plan.id },
          data: {
            outcomeSales: sales,
            outcomeGoal: goal,
            outcomeSuccess: success,
          },
        });
        count++;

        const memoryKey = `advisor_feedback_${plan.userId}`;
        const existingMemory = await prisma.aiMemory.findUnique({
          where: { storeId_userId_key: { storeId, userId: plan.userId, key: memoryKey } },
        });

        const feedbackData = existingMemory ? JSON.parse(existingMemory.content) : { successes: [], failures: [] };
        if (success) {
          feedbackData.successes.push({ focus: plan.focus, date: plan.date.toISOString().slice(0, 10) });
        } else {
          feedbackData.failures.push({ focus: plan.focus, date: plan.date.toISOString().slice(0, 10) });
        }

        feedbackData.successes = feedbackData.successes.slice(-5);
        feedbackData.failures = feedbackData.failures.slice(-5);

        await prisma.aiMemory.upsert({
          where: { storeId_userId_key: { storeId, userId: plan.userId, key: memoryKey } },
          update: { content: JSON.stringify(feedbackData) },
          create: {
            storeId,
            userId: plan.userId,
            key: memoryKey,
            content: JSON.stringify(feedbackData),
          },
        });
      }
    }

    return { evaluated: count };
  }
}
