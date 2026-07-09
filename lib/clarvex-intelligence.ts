import { prisma } from "@/lib/prisma";
import type { Session } from "@/lib/session";
import { computeAchievements } from "@/lib/achievements";
import { computeDailyStreak } from "@/lib/streaks";
import { decodeSyncLogMessage } from "@/lib/data-source";
import { buildRetailMonths, selectRetailMonth } from "@/lib/kpi-period";
import { mergeRdvWeeks } from "@/lib/rdv-week";

export class ClarvexIntelligence {
  private static getApiKey() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("La API Key de Gemini no está configurada.");
    }
    return apiKey;
  }

  private static async callGemini(prompt: string, jsonMode = true): Promise<string> {
    const apiKey = this.getApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: jsonMode ? "application/json" : "text/plain",
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Gemini API Call Error]:", errorText);
      throw new Error("Fallo al conectar con el servicio de Inteligencia Artificial.");
    }

    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No se recibió respuesta válida del modelo de IA.");
    }
    return text.trim();
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

    return this.callGemini(contextPrompt, false);
  }

  /**
   * Plan del Día IA - Customized Daily Plan with AI memory persistence to prevent repetition.
   */
  public static async generateDailyPlan(session: Session, userId: string, dateStr: string) {
    const parsedDate = new Date(`${dateStr}T12:00:00.000Z`);

    // 1. Load context
    const [targetUser, userKpis, pendingTasks, weekPlans, storeLog] = await Promise.all([
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
    ]);

    if (!targetUser) throw new Error("Colaborador no encontrado.");

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
Analiza sus métricas recientes de KPIs, tareas pendientes y las actividades ya asignadas recientemente para no repetirlas.

Métricas recientes de ${targetUser.name}:
${JSON.stringify(kpiSummary, null, 2)}

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

    const generatedText = await this.callGemini(prompt, true);
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

    const generatedText = await this.callGemini(prompt, true);
    const parsedResult = JSON.parse(generatedText);

    // Save in memory cache
    await prisma.aiMemory.upsert({
      where: { storeId_userId_key: { storeId: session.storeId, userId, key: memoryKey } },
      update: { content: generatedText },
      create: {
        storeId: session.storeId,
        userId,
        key: memoryKey,
        content: generatedText,
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

    const generatedText = await this.callGemini(prompt, true);
    return JSON.parse(generatedText);
  }

  /**
   * Dashboard Ejecutivo IA - Executive store health, risks, anomalies, actions.
   */
  public static async getExecutiveHealth(session: Session) {
    const [kpis, pendings, logs] = await Promise.all([
      prisma.kpi.findMany({
        where: { storeId: session.storeId },
        orderBy: { date: "desc" },
        take: 15,
        include: { user: { select: { name: true, role: true } } },
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

    const kpiSummary = kpis.map((k) => ({
      name: k.user.name,
      role: k.user.role,
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
      conversion: k.conversion ? Number(k.conversion) : 0,
      upt: Number(k.upt),
    }));

    const tasks = pendings.map((t) => `${t.title} (${t.priority})`);
    const logsSummary = logs.map((l) => `${l.category}: ${l.description}`);

    const prompt = `
Eres un auditor de operaciones retail senior. Tu tarea es evaluar la salud general de la tienda y generar sugerencias operativas directas.

Resumen del rendimiento del equipo:
${JSON.stringify(kpiSummary, null, 2)}

Pendientes activos:
${tasks.join(", ") || "Ninguno"}

Últimas notas de bitácora:
${logsSummary.join("\n") || "Ninguna"}

Responde estrictamente en formato JSON utilizando el siguiente esquema:
{
  "storeHealth": "VERDE | AMARILLO | ROJO (Semáforo de salud operativa)",
  "fortheleses": ["string (Fortaleza 1)", "string (Fortaleza 2)"],
  "risks": ["string (Riesgo 1)", "string (Riesgo 2)"],
  "topAdvisor": "string (Nombre del asesor destacado y por qué)",
  "opportunityAdvisor": "string (Nombre del asesor con mayor área de oportunidad y por qué)",
  "priorities": ["string (Prioridad operativa 1)", "string (Prioridad operativa 2)"],
  "actions": ["string (Acción sugerida 1)", "string (Acción sugerida 2)"]
}
`;

    const generatedText = await this.callGemini(prompt, true);
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

    const generatedText = await this.callGemini(prompt, true);
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

    const generatedText = await this.callGemini(prompt, true);
    return JSON.parse(generatedText);
  }
}
