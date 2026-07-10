import { prisma } from "@/lib/prisma";
import { AI_CONFIG } from "@/lib/ai/config";
import { createProviderRouter } from "@/lib/ai/providers/provider-router";
import { recordAiUsage } from "@/lib/ai/telemetry";
import type { Session } from "@/lib/session";
import { computeAchievements } from "@/lib/achievements";
import { computeDailyStreak } from "@/lib/streaks";
import { decodeSyncLogMessage } from "@/lib/data-source";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildRetailMonths, selectRetailMonth } from "@/lib/kpi-period";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic, type RawKpi } from "@/lib/kpi-report";
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

type AiKpiRow = {
  userId: string;
  date: Date;
  dailySales: unknown;
  dailyGoal: unknown;
  transactions: number;
  pieces: number;
  conversion: unknown;
  traffic: number | null;
  user: { name: string; role: "GERENTE" | "SUBGERENTE" | "ASESOR" | "REGIONAL"; photoUrl: string | null };
};

/** Métricas alineadas con la vista KPIs: tráfico de tienda por día (sin sumar filas duplicadas) y conversión de asesores = tickets / tráfico de sus días. */
export function buildAiKpiSnapshot(rows: AiKpiRow[]) {
  const normalized: RawKpi[] = rows.map((row) => ({
    userId: row.userId,
    date: row.date,
    dailySales: row.dailySales,
    dailyGoal: row.dailyGoal,
    transactions: row.transactions,
    pieces: row.pieces,
    conversion: row.conversion,
    traffic: row.traffic,
    grossSales: null,
    discountAmount: null,
    discountLimit: null,
    commissionAmount: 0,
    commissionPercent: 0,
    user: row.user
  }));
  const reports = aggregateKpis(normalized);
  const traffic = aggregateStoreTraffic(normalized.map((row) => ({ date: row.date as Date, traffic: row.traffic })));
  const store = aggregateStore(reports, traffic);
  const advisors = reports.filter((row) => row.role === "ASESOR");
  return { store, advisors, reports, traffic };
}

export const DailySummaryContentSchema = z.object({
  summary: z.string().min(1).max(1500),
  positives: z.array(z.string().max(300)).max(10),
  negatives: z.array(z.string().max(300)).max(10),
  actionPlanTomorrow: z.array(z.string().max(300)).max(10),
});

export type DailySummaryContent = z.infer<typeof DailySummaryContentSchema>;

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
      if (p.includes("executive") || p.includes("health") || p.includes("salud")) {
        return JSON.stringify({
          status: "EXCELLENT",
          metrics: { UPT: 2.1, conversion: 15.2 },
          insights: ["La tienda Test Norte mantiene un excelente desempeño de ventas."]
        });
      }
      return jsonMode ? JSON.stringify({ message: "Respuesta mock de IA", success: true }) : "Texto mock de IA";
    }

    // El transporte real ahora pasa por la abstracción de proveedor (Groq como
    // principal, con fallback a Cloudflare). Se mantiene el nombre callGemini y
    // el bloque mock de arriba por compatibilidad interna y con los tests.
    const startedAt = Date.now();
    const router = createProviderRouter();
    try {
      const result = await router.chatComplete({
        model: AI_CONFIG.models.advanced,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        jsonMode
      });
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
   * Clarvex Copilot - Conversational Assistant using actual DB records.
   */
  public static async askCopilot(session: Session, query: string): Promise<string> {
    // 1. Gather all relevant context for this store/user
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const isAdvisor = session.role === "ASESOR";
    const ownKpiFilter = isAdvisor ? { userId: session.userId } : {};

    // Query available weeks and sync log details first to establish the retail month range bounds
    const [availableWeekRows, legacyWeekRows, latestKpiSource, pendings, schedules, announcements, commissionRules, user] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: session.storeId, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null } },
        distinct: ["weekStart", "weekNumber"],
        select: { weekNumber: true, weekStart: true, weekEnd: true },
        orderBy: { weekStart: "desc" }
      }),
      prisma.kpi.findMany({
        where: { storeId: session.storeId, OR: [{ weekNumber: null }, { weekStart: null }, { weekEnd: null }] },
        distinct: ["date"],
        select: { date: true },
        orderBy: { date: "desc" }
      }),
      prisma.dataSource.findFirst({
        where: { storeId: session.storeId, type: "KPIS" },
        include: { syncLogs: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 1 } }
      }),
      prisma.pending.findMany({
        where: { storeId: session.storeId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        take: 10,
      }),
      prisma.schedule.findMany({
        where: { storeId: session.storeId, ...ownKpiFilter },
        orderBy: { date: "asc" },
        take: 20,
        include: { user: { select: { name: true } } },
      }),
      prisma.announcement.findMany({
        where: { storeId: session.storeId },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      prisma.commissionRule.findMany({
        where: { storeId: session.storeId, active: true },
      }),
      prisma.user.findUnique({
        where: { id: session.userId },
        select: { name: true, role: true },
      }),
    ]);

    const persistedWeeks = availableWeekRows.flatMap((week) => week.weekNumber !== null && week.weekStart && week.weekEnd ? [{ weekNumber: week.weekNumber, weekStart: week.weekStart, weekEnd: week.weekEnd }] : []);
    const latestDetails = latestKpiSource?.syncLogs[0] ? decodeSyncLogMessage(latestKpiSource.syncLogs[0].message).details : null;
    
    const syncedWeeks = (latestDetails && typeof latestDetails === "object" && "weeksDetected" in latestDetails && Array.isArray((latestDetails as any).weeksDetected))
      ? (latestDetails as any).weeksDetected.map((week: any) => ({
          weekNumber: week.weekNumber,
          weekStart: new Date(`${week.weekStart}T00:00:00.000Z`),
          weekEnd: new Date(`${week.weekEnd}T00:00:00.000Z`)
        }))
      : [];
    
    const availableWeeks = mergeRdvWeeks([...persistedWeeks, ...syncedWeeks], legacyWeekRows.map((row) => row.date))
      .sort((left, right) => left.weekStart.getTime() - right.weekStart.getTime());
    
    const retailMonths = buildRetailMonths(availableWeeks);
    const selectedRetailMonth = selectRetailMonth(retailMonths, now);

    let start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let end = now;
    if (selectedRetailMonth) {
      start = selectedRetailMonth.start;
      end = selectedRetailMonth.end;
    }

    // Now query the filtered KPIs within the current retail month bounds
    const kpis = await prisma.kpi.findMany({
      where: { storeId: session.storeId, date: { gte: start, lte: end }, ...ownKpiFilter },
      orderBy: { date: "desc" },
      include: { user: { select: { name: true } } },
    });

    // 2. Build concise prompt
    const kpiSummary = kpis.map((k) => ({
      fecha: k.date.toISOString().slice(0, 10),
      colaborador: k.user.name,
      venta_dia: Number(k.dailySales),
      meta_dia: Number(k.dailyGoal),
      venta_mensual_acumulada: Number(k.monthlySales),
      meta_mensual: Number(k.monthlyGoal),
      conversion: k.conversion ? Number(k.conversion) : null,
      upt: Number(k.upt),
      comision_pesos: Number(k.commissionAmount),
      comision_porcentaje: Number(k.commissionPercent),
      ranking: k.ranking,
    }));

    const taskSummary = pendings.map((p) => ({
      titulo: p.title,
      prioridad: p.priority,
      vence: p.dueDate.toISOString().slice(0, 10),
    }));

    const scheduleSummary = schedules.map((s) => ({
      colaborador: s.user.name,
      dia: s.day,
      entrada: s.startTime ?? s.statusRaw ?? s.status,
      zona: s.zone ?? "",
    }));

    const newsSummary = announcements.map((a) => ({
      titulo: a.title,
      cuerpo: a.body.slice(0, 100) + "...",
    }));

    const rulesSummary = commissionRules.map((r) => ({
      rol: r.role ?? "Todos",
      venta_minima: Number(r.minSales),
      comision_porcentaje: Number(r.commissionPercent),
      alcance_minimo: Number(r.minAchievement),
    }));

    // Manager commission calculations (since managers commission on store sales)
    let managerCommissionText = "";
    if (session.role === "GERENTE" || session.role === "SUBGERENTE") {
      if (selectedRetailMonth) {
        const monthKpis = await prisma.kpi.findMany({
          where: { storeId: session.storeId, date: { gte: start, lte: end } },
        });

        const dailyTotals = new Map<string, { sales: number; goal: number }>();
        for (const k of monthKpis) {
          const key = k.date.toISOString().slice(0, 10);
          const current = dailyTotals.get(key) || { sales: 0, goal: 0 };
          dailyTotals.set(key, {
            sales: current.sales + Number(k.dailySales),
            goal: current.goal + Number(k.dailyGoal),
          });
        }

        let storeSales = 0;
        let storeGoal = 0;
        dailyTotals.forEach((totals) => {
          storeSales += totals.sales;
          storeGoal += totals.goal;
        });

        let storeMinimum = storeGoal > 0 ? storeGoal / 1.15 : 0;
        if (latestDetails && typeof latestDetails === "object" && "ttlsCommissionMinimum" in latestDetails) {
          const min = (latestDetails as any).ttlsCommissionMinimum;
          if (min && min > 0) storeMinimum = Number(min);
        }

        const achievement = storeMinimum > 0 ? (storeSales / storeMinimum) * 100 : 0;

        const active = commissionRules
          .filter((rule) => rule.active && rule.role === session.role)
          .sort((a, b) => Number(a.minAchievement) - Number(b.minAchievement));
        
        let activePercent = 0;
        for (const r of active) {
          if (achievement >= Number(r.minAchievement) && (r.maxAchievement === null || r.maxAchievement === undefined || achievement <= Number(r.maxAchievement))) {
            activePercent = Number(r.commissionPercent);
            break;
          }
        }
        
        const amount = storeSales * (activePercent / 100);
        const monthWeeks = availableWeeks.filter(w => w.weekStart >= start && w.weekEnd <= end);
        const totalWeeks = monthWeeks.length || 4;
        const weeksElapsed = monthWeeks.filter(w => w.weekStart <= now).length || 1;
        
        const projectedSales = Math.max(storeSales, (storeSales / weeksElapsed) * totalWeeks);
        const projectedAmount = Math.max(amount, projectedSales * (activePercent / 100));

        managerCommissionText = `
INFORMACIÓN DE COMISIÓN DE GERENCIA (solo visible para ti al tener rol ${session.role}):
- Venta acumulada de la tienda este mes: $${storeSales.toFixed(2)} pesos.
- Meta mensual de la tienda: $${storeGoal.toFixed(2)} pesos.
- Mínimo de comisión de la tienda: $${storeMinimum.toFixed(2)} pesos.
- Alcance vs mínimo actual de la tienda: ${Math.round(achievement)}%.
- Porcentaje de comisión correspondiente a tu rol (${session.role}) por este alcance: ${activePercent}%.
- Comisión ganada acumulada (cifra real actual de tu rol): $${amount.toFixed(2)} pesos.
- Comisión proyectada a fin de mes (a ritmo actual): $${projectedAmount.toFixed(2)} pesos (venta proyectada de $${projectedSales.toFixed(2)}).
`;
      }
    }

    const contextPrompt = `
Eres Clarvex Copilot, el asistente inteligente de operaciones para tiendas retail.
Tu usuario actual es: ${user?.name} (Rol: ${user?.role}).
La fecha actual es: ${todayStr}.
Solo debes usar la información real de la tienda provista a continuación. Jamás inventes datos, nombres ni números.
Si no tienes la información para responder la pregunta del usuario, indícalo amablemente.

REGLA DE SEGURIDAD CRÍTICA:
- El usuario actual tiene el rol: ${user?.role}.
- Si el rol del usuario es "ASESOR", la información provista en "KPIs recientes" YA ESTÁ filtrada para contener ÚNICAMENTE sus propios registros individuales de ventas y comisiones.
- Si el rol es "ASESOR", bajo ninguna circunstancia debes mostrar o hacer referencia a ventas, metas, rankings o comisiones de otros compañeros de equipo. Si te preguntan sobre las ventas de la tienda, de otros asesores o comisiones grupales, responde cortésmente explicando que por políticas de seguridad solo tienes acceso a su información de rendimiento individual.

INFORMACIÓN REAL DE LA TIENDA:
- KPIs recientes (Ventas, Metas, Avance Mensual, Comisiones del colaborador, Rankings):
${JSON.stringify(kpiSummary, null, 2)}

${managerCommissionText}

- Reglas de comisiones activas en la tienda:
${JSON.stringify(rulesSummary, null, 2)}

- Pendientes activos:
${JSON.stringify(taskSummary, null, 2)}

- Horarios y turnos de la semana:
${JSON.stringify(scheduleSummary, null, 2)}

- Últimos comunicados:
${JSON.stringify(newsSummary, null, 2)}

PREGUNTA DEL USUARIO:
"${query}"

INSTRUCCIONES DE FORMATO IMPORTANTES:
- Responde en español de manera profesional, clara y directa.
- Es MANDATORIO que uses saltos de línea dobles y listas con viñetas para estructurar la información.
- NUNCA respondas en un solo párrafo largo y corrido. Separa los puntos con saltos de línea para que sea fácil de leer en pantallas móviles.
`;

    return this.callGemini(contextPrompt, false, { storeId: session.storeId, userId: session.userId, feature: "copilot-legacy" });
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
    const memoryKey = `advisor_profile_${userId}`;

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
   * Predict IA - Calculate likelihood of reaching monthly target, closing projection, and commissions.
   */
  public static async predictMetrics(session: Session) {
    const [kpis, rules] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: session.storeId },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.commissionRule.findMany({
        where: { storeId: session.storeId },
      }),
    ]);

    if (kpis.length === 0) {
      return {
        probabilityGoal: 50,
        expectedCloseSales: 0,
        salesRemaining: 0,
        salesPerHourNeeded: 0,
        probabilityCommission: 50,
        details: "No hay suficientes KPIs históricos para realizar predicciones.",
      };
    }

    const salesHistory = kpis.map((k) => ({
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
      monthGoal: Number(k.monthlyGoal),
      monthSales: Number(k.monthlySales),
    }));

    const prompt = `
Eres un analista predictivo financiero de retail.
Basándote en el historial de ventas recientes de la tienda, calcula las siguientes predicciones operativas.

Historial de ventas (recientes):
${JSON.stringify(salesHistory, null, 2)}

Reglas de comisiones vigentes:
${JSON.stringify(rules, null, 2)}

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "probabilityGoal": 75 (Probabilidad de cumplir la meta mensual en porcentaje, entero entre 0 y 100),
  "expectedCloseSales": 125000 (Venta esperada estimada acumulada al cierre de mes, en pesos),
  "salesRemaining": 25000 (Venta faltante estimada para llegar a la meta mensual, en pesos),
  "salesPerHourNeeded": 1800 (Venta promedio necesaria por hora en lo que resta del mes, en pesos),
  "probabilityCommission": 80 (Probabilidad promedio de que el equipo comisione, entero entre 0 y 100),
  "details": "string (Breve explicación del modelo predictivo y sus premisas, máx 250 caracteres)"
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "predict" });
    return JSON.parse(generatedText);
  }

  /**
   * Dashboard Ejecutivo IA - salud de tienda con datos acumulados HASTA AYER
   * (nunca incluye el día en curso). Ranking solo entre asesores.
   */
  public static async getExecutiveHealth(session: Session) {
    const todayInfo = resolveMonterreyDate();
    const yesterday = new Date(todayInfo.utcDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const { start: yesterdayStart, end: throughExclusive } = utcDayRange(yesterdayKey);

    // Mes calendario del corte (hasta ayer). Si hay semanas RDV, preferir mes retail.
    const monthStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 1));
    const weekRows = await prisma.kpi.findMany({
      where: { storeId: session.storeId, weekStart: { not: null } },
      distinct: ["weekStart"],
      select: { weekStart: true, weekEnd: true },
      orderBy: { weekStart: "asc" }
    });
    const retailMonths = buildRetailMonths(
      weekRows
        .filter((row): row is { weekStart: Date; weekEnd: Date } => Boolean(row.weekStart && row.weekEnd))
        .map((row) => ({ weekStart: row.weekStart, weekEnd: row.weekEnd }))
    );
    const retailMonth = selectRetailMonth(retailMonths, yesterday);
    const periodStart = retailMonth?.start ?? monthStart;
    const periodLabel = retailMonth?.label ?? yesterday.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

    const [periodKpis, yesterdayKpis, pendings, logs] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: session.storeId, date: { gte: periodStart, lt: throughExclusive } },
        include: { user: { select: { name: true, role: true, photoUrl: true } } },
        orderBy: { date: "asc" }
      }),
      prisma.kpi.findMany({
        where: { storeId: session.storeId, date: { gte: yesterdayStart, lt: throughExclusive } },
        include: { user: { select: { name: true, role: true, photoUrl: true } } }
      }),
      prisma.pending.findMany({
        where: { storeId: session.storeId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      }),
      prisma.storeLog.findMany({
        where: { storeId: session.storeId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const sumRows = (rows: typeof periodKpis) => {
      const snapshot = buildAiKpiSnapshot(rows);
      const store = snapshot.store;
      if (!store) {
        return { sales: 0, goal: 0, achievement: 0, tickets: 0, pieces: 0, traffic: 0, upt: 0, conversion: 0 };
      }
      return {
        sales: store.sales,
        goal: store.goal,
        achievement: store.achievement,
        tickets: store.transactions,
        pieces: store.pieces,
        traffic: store.traffic ?? 0,
        upt: store.upt ?? 0,
        conversion: store.conversion ?? 0
      };
    };

    const storePeriod = sumRows(periodKpis);
    const storeYesterday = sumRows(yesterdayKpis);

    // Ranking solo asesores — misma conversión que la pestaña KPIs (aggregateKpis).
    const advisors = buildAiKpiSnapshot(periodKpis).advisors
      .map((advisor) => ({
        name: advisor.userName,
        sales: advisor.sales,
        goal: advisor.goal,
        achievement: advisor.achievement,
        upt: advisor.upt,
        conversion: advisor.conversion
      }))
      .sort((a, b) => b.achievement - a.achievement);

    const topAdvisor = advisors[0]
      ? `${advisors[0].name} (${advisors[0].achievement.toFixed(1)}% de su meta del periodo)`
      : "Sin asesores con datos hasta ayer";
    const opportunityAdvisor = advisors.length
      ? `${advisors[advisors.length - 1].name} (${advisors[advisors.length - 1].achievement.toFixed(1)}% de su meta del periodo)`
      : "Sin asesores con datos hasta ayer";

    const tasks = pendings.map((t) => `${t.title} (${t.priority})`);
    const logsSummary = logs.map((l) => `${l.category}: ${l.description}`);

    const prompt = `
Eres un auditor de operaciones retail senior. Evalúa la salud de la tienda con datos CERRADOS hasta ayer (${yesterdayKey}). NO uses ni inventes el día de hoy.

Periodo analizado: ${periodLabel} (desde ${periodStart.toISOString().slice(0, 10)} hasta ${yesterdayKey} inclusive).

MÉTRICAS DETERMINISTAS DE TIENDA (acumulado del periodo hasta ayer):
- Venta: $${storePeriod.sales.toFixed(2)}
- Meta: $${storePeriod.goal.toFixed(2)}
- Alcance: ${storePeriod.achievement.toFixed(1)}%
- UPT: ${storePeriod.upt.toFixed(2)}
- Conversión: ${storePeriod.conversion.toFixed(1)}%
- Tickets: ${storePeriod.tickets} | Piezas: ${storePeriod.pieces} | Tráfico: ${storePeriod.traffic}

CIERRE DE AYER (${yesterdayKey}):
- Venta: $${storeYesterday.sales.toFixed(2)} / Meta: $${storeYesterday.goal.toFixed(2)} (${storeYesterday.achievement.toFixed(1)}%)
- UPT: ${storeYesterday.upt.toFixed(2)} | Conversión: ${storeYesterday.conversion.toFixed(1)}%

ASESORES (solo rol ASESOR; conversión = tickets del asesor / tráfico de tienda en sus días, igual que KPIs):
${JSON.stringify(advisors, null, 2)}

Destacado precalculado: ${topAdvisor}
Oportunidad precalculada: ${opportunityAdvisor}

Pendientes activos:
${tasks.join(", ") || "Ninguno"}

Últimas notas de bitácora:
${logsSummary.join("\n") || "Ninguna"}

Reglas:
1. Basa riesgos y acciones en las métricas deterministas y pendientes reales.
2. En topAdvisor y opportunityAdvisor usa EXCLUSIVAMENTE asesores (ASESOR). Si no hay asesores, indícalo.
3. No culpes a gerencia por "0 ventas personales".
4. Copia EXACTAMENTE los % de conversión deterministas (tienda y asesores); no recalcules ni inventes otros.
5. Sé concreto y operativo.

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "storeHealth": "VERDE | AMARILLO | ROJO (Semáforo de salud operativa)",
  "fortheleses": ["string (Fortaleza 1)", "string (Fortaleza 2)"],
  "risks": ["string (Riesgo 1)", "string (Riesgo 2)"],
  "topAdvisor": "string (Asesor destacado y por qué)",
  "opportunityAdvisor": "string (Asesor con mayor área de oportunidad y por qué)",
  "priorities": ["string (Prioridad operativa 1)", "string (Prioridad operativa 2)"],
  "actions": ["string (Acción sugerida 1)", "string (Acción sugerida 2)"]
}
`;

    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "executive" });
    return JSON.parse(generatedText);
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
    // Los KPIs del RDV se guardan en medianoche UTC; hay que buscar por rango del día.
    const { start: dayStart, end: dayEnd } = utcDayRange(dateStr);

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

    // 2. Cargar KPIs del día ANTES del candado — permite reutilizar READY si el hash sigue igual.
    const [kpis, pendings] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: session.storeId, date: { gte: dayStart, lt: dayEnd } },
        include: { user: { select: { name: true, role: true, photoUrl: true } } },
      }),
      prisma.pending.findMany({
        where: { storeId: session.storeId },
      }),
    ]);

    const salesProbe = kpis.reduce((acc, k) => acc + Number(k.dailySales), 0);
    const goalProbe = kpis.reduce((acc, k) => acc + Number(k.dailyGoal), 0);

    if (kpis.length === 0 || (salesProbe === 0 && goalProbe === 0)) {
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

    // 3. Cálculos deterministas — misma lógica que la pestaña KPIs
    // (tráfico de tienda por día, sin sumar el valor duplicado en cada fila).
    const snapshot = buildAiKpiSnapshot(kpis);
    const store = snapshot.store;
    const salesTotal = store?.sales ?? 0;
    const goalTotal = store?.goal ?? 0;
    const ticketsTotal = store?.transactions ?? 0;
    const piecesTotal = store?.pieces ?? 0;
    const trafficTotal = store?.traffic ?? 0;
    const storeReach = store?.achievement ?? 0;
    const storeDiff = salesTotal - goalTotal;
    const storeUpt = store?.upt ?? 0;
    const storeAur = store?.aur ?? 0;
    const storeEpt = store?.ept ?? 0;
    const storeConversion = store?.conversion ?? 0;

    const advisors = snapshot.advisors.map((advisor) => ({
      name: advisor.userName,
      role: advisor.role,
      sales: advisor.sales,
      goal: advisor.goal,
      achievement: advisor.achievement,
      upt: advisor.upt,
      conversion: advisor.conversion,
      ranking: advisor.ranking
    }));

    const sortedAdvisors = [...advisors].sort((a, b) => b.achievement - a.achievement);
    const topAdvisor = sortedAdvisors[0] ? `${sortedAdvisors[0].name} (${sortedAdvisors[0].achievement.toFixed(1)}% meta)` : "Ninguno";
    const opportunityAdvisor = sortedAdvisors.length
      ? `${sortedAdvisors[sortedAdvisors.length - 1].name} (${sortedAdvisors[sortedAdvisors.length - 1].achievement.toFixed(1)}% meta)`
      : "Ninguno";

    const pendingList = pendings.map((p) => `${p.title} (Estado: ${p.status}, Prioridad: ${p.priority})`);

    const metricsSnapshot = {
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
      storeSales: Number(salesTotal).toFixed(2),
      storeGoal: Number(goalTotal).toFixed(2),
      storeConversion: Number(storeConversion).toFixed(2),
      storeTraffic: Number(trafficTotal),
      topAdvisor,
      opportunityAdvisor,
      advisors: advisors.map((a) => ({
        name: a.name,
        sales: a.sales.toFixed(2),
        goal: a.goal.toFixed(2),
        conversion: a.conversion === null ? null : Number(a.conversion).toFixed(2)
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

    // Prompt adaptado para Gemini
    const prompt = `
Eres un gerente regional y analista operativo de retail para la cadena Clarvex. Analiza el rendimiento del día anterior y redacta el resumen diario.

Fecha analizada: ${dateStr}

MÉTRICAS DE LA TIENDA YA CALCULADAS (DETERMINISTAS):
- Venta total: $${salesTotal.toFixed(2)} pesos
- Meta total: $${goalTotal.toFixed(2)} pesos
- Alcance de meta de tienda: ${storeReach.toFixed(1)}%
- Diferencia vs meta: $${storeDiff.toFixed(2)} pesos (${storeDiff >= 0 ? 'excedente' : 'faltante'})
- UPT (Unidades por ticket) promedio de tienda: ${storeUpt.toFixed(2)}
- AUR (Precio promedio por unidad): $${storeAur.toFixed(2)}
- EPT (Venta promedio por ticket): $${storeEpt.toFixed(2)}
- Tráfico de tienda del día: ${trafficTotal}
- Conversión de tráfico de tienda: ${storeConversion.toFixed(1)}%  (tickets de tienda / tráfico; NO inventes otro %)

RENDIMIENTO DE ASESORES (solo ASESOR; conversión = sus tickets / tráfico de tienda de ese día, igual que KPIs):
${JSON.stringify(advisors, null, 2)}

Colaborador más destacado: ${topAdvisor}
Colaborador con mayor oportunidad: ${opportunityAdvisor}

PENDIENTES ACTUALES DE LA TIENDA:
${JSON.stringify(pendingList, null, 2)}

Instrucciones de redacción:
1. Redacta un resumen analizando el desempeño, explicando los motivos detrás de las métricas (UPT, conversión, AUR) y destacando hitos y problemas del día anterior.
2. Identifica puntos positivos (Éxitos) y puntos negativos/áreas de oportunidad (Puntos a cuidar).
3. Diseña un plan de acción sugerido para hoy (Estrategia).
4. No realices cálculos numéricos tú mismo; copia EXACTAMENTE los % y montos deterministas de arriba (en especial conversión de tienda y por asesor).
5. No evalúes a GERENTE/SUBGERENTE como si fueran asesores de piso.

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "summary": "string (Resumen general del desempeño del día analizado, tono ejecutivo profesional, entre 3 y 5 oraciones)",
  "positives": ["string (Mínimo 1, máximo 3 puntos positivos destacados)"],
  "negatives": ["string (Mínimo 1, máximo 3 áreas de oportunidad)"],
  "actionPlanTomorrow": ["string (Mínimo 2, máximo 4 acciones concretas sugeridas para la operación de hoy en base al desempeño previo)"]
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
    const start = new Date(`${startStr}T00:00:00.000Z`);
    const end = new Date(`${endStr}T23:59:59.999Z`);

    const [kpis, store] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: session.storeId, date: { gte: start, lte: end } },
        include: { user: { select: { name: true, role: true } } },
      }),
      prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } }),
    ]);

    const salesTotal = kpis.reduce((acc, k) => acc + Number(k.dailySales), 0);
    const goalTotal = kpis.reduce((acc, k) => acc + Number(k.dailyGoal), 0);
    const advisorPerformance = new Map<string, { name: string; sales: number; goal: number; count: number }>();

    for (const k of kpis) {
      const current = advisorPerformance.get(k.userId) || { name: k.user.name, sales: 0, goal: 0, count: 0 };
      advisorPerformance.set(k.userId, {
        name: k.user.name,
        sales: current.sales + Number(k.dailySales),
        goal: current.goal + Number(k.dailyGoal),
        count: current.count + 1,
      });
    }

    const performanceSummary: any[] = [];
    advisorPerformance.forEach((v) => {
      performanceSummary.push({
        colaborador: v.name,
        ventasAcumuladas: v.sales,
        metaAcumulada: v.goal,
        porcentajeCumplimiento: v.goal > 0 ? Math.round((v.sales / v.goal) * 100) : 100,
        diasTrabajados: v.count,
      });
    });

    const prompt = `
Eres un consultor ejecutivo de retail de alto nivel. Analiza el desempeño del periodo indicado y genera un informe de rendimiento de negocio estructurado y profesional para la tienda "${store?.name}".

Tipo de Reporte: ${type}
Periodo: del ${startStr} al ${endStr}
Venta total acumulada en tienda: $${salesTotal.toFixed(2)} pesos
Meta total acumulada en tienda: $${goalTotal.toFixed(2)} pesos
Rendimiento acumulado de los colaboradores en el periodo:
${JSON.stringify(performanceSummary, null, 2)}

Escribe un reporte de negocio completo. Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "title": "string (Título formal del reporte)",
  "executiveSummary": "string (Resumen ejecutivo del desempeño general y financiero del periodo)",
  "performanceAnalysis": "string (Análisis de la productividad del equipo y comportamiento de los KPIs)",
  "strengths": ["string", "string"],
  "weaknesses": ["string", "string"],
  "strategicRecommendations": ["string (Acciones estratégicas clave a mediano plazo para impulsar ventas, conversión y eficiencia)"]
}
`;
    const generatedText = await this.callGemini(prompt, true, { storeId: session.storeId, userId: session.userId, feature: "report" });
    return JSON.parse(generatedText);
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
