import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La API Key de Gemini no está configurada." },
      { status: 500 }
    );
  }

  try {
    const { date } = await request.json().catch(() => ({ date: new Date().toISOString().slice(0, 10) }));
    const parsedDate = new Date(`${date}T12:00:00.000Z`);

    // 1. Obtener KPIs históricos recientes de la tienda (últimos 7 registros de KPI)
    const recentKpis = await prisma.kpi.findMany({
      where: { storeId: session.storeId, date: { lte: parsedDate } },
      orderBy: { date: "desc" },
      take: 7,
      include: { user: { select: { name: true } } }
    });

    // 2. Obtener tareas pendientes
    const pendingTasks = await prisma.pending.findMany({
      where: { storeId: session.storeId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      select: { title: true, description: true, priority: true }
    });

    // 3. Formatear la información para el Prompt de Gemini
    const kpiSummary = recentKpis.map(k => ({
      date: k.date.toISOString().slice(0, 10),
      advisor: k.user.name,
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
      upt: Number(k.upt),
      conversion: k.conversion ? Number(k.conversion) : null,
      avgTicket: Number(k.avgTicket)
    }));

    const tasksSummary = pendingTasks.map(t => `${t.title} (${t.priority}): ${t.description}`);

    const prompt = `
Eres un consultor experto en operaciones de retail y analista de tiendas. Tu objetivo es proponer el "Plan del Día" estratégico para el gerente de la tienda.
Analiza la siguiente información de rendimiento y tareas pendientes para formular una estrategia clara y accionable.

KPIs recientes del equipo:
${JSON.stringify(kpiSummary, null, 2)}

Tareas operativas o de mantenimiento pendientes:
${tasksSummary.length > 0 ? tasksSummary.join("\n") : "Ninguna"}

Genera un plan del día con:
1. Un "focus" (Foco estratégico de máximo 100 caracteres. Ej: "Elevar conversión en probadores y accesorios").
2. Un "message" (Mensaje motivacional y directiva clave para el equipo, de máximo 300 caracteres).
3. Una lista de "activities" (De 3 a 5 actividades operativas específicas y medibles para la lista de tareas del día).

Debes responder estrictamente en formato JSON utilizando el siguiente esquema:
{
  "focus": "string",
  "message": "string",
  "activities": ["string"]
}
`;

    // 4. Llamada HTTP a Gemini 2.5 Flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Gemini API Error]:", errorText);
      throw new Error("Error en la respuesta del servicio de IA.");
    }

    const resJson = await response.json();
    const generatedText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error("No se recibió respuesta válida del modelo de IA.");
    }

    const planData = JSON.parse(generatedText.trim());
    return NextResponse.json(planData);
  } catch (error: any) {
    console.error("[Plan AI API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar la sugerencia de IA." },
      { status: 500 }
    );
  }
}
