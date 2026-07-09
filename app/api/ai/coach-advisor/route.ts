import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["ASESOR", "GERENTE", "SUBGERENTE"]);
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

    // 1. Obtener KPIs históricos recientes del asesor (últimos 7 registros)
    const recentKpis = await prisma.kpi.findMany({
      where: { userId: session.userId, date: { lte: parsedDate } },
      orderBy: { date: "desc" },
      take: 7
    });

    if (recentKpis.length === 0) {
      return NextResponse.json({
        tips: [
          {
            title: "¡Empieza con energía!",
            description: "Aún no tenemos registros de tus KPIs esta semana. Enfócate hoy en conectar con cada cliente que entre a la tienda y ofrecerle un excelente servicio."
          }
        ]
      });
    }

    // 2. Formatear la información para el Prompt de Gemini
    const kpiSummary = recentKpis.map(k => ({
      date: k.date.toISOString().slice(0, 10),
      sales: Number(k.dailySales),
      goal: Number(k.dailyGoal),
      upt: Number(k.upt),
      conversion: k.conversion ? Number(k.conversion) : null,
      avgTicket: Number(k.avgTicket)
    }));

    const prompt = `
Eres un coach de ventas experto en retail. Tu objetivo es aconsejar y motivar a un asesor de tienda en su desempeño diario.
Analiza la siguiente información de rendimiento del asesor (últimos días) y dale 3 consejos de venta muy concretos, prácticos y accionables enfocados en mejorar sus áreas de oportunidad actuales (ej. si su UPT es bajo, sugiere cómo aumentar prendas por ticket; si su ticket promedio es bajo, sugiere venta cruzada).

Métricas del asesor:
${JSON.stringify(kpiSummary, null, 2)}

Genera 3 consejos prácticos.
Debes responder estrictamente en formato JSON utilizando el siguiente esquema:
{
  "tips": [
    {
      "title": "string (título corto y motivacional)",
      "description": "string (explicación de la técnica o consejo, máximo 200 caracteres)"
    }
  ]
}
`;

    // 3. Llamada HTTP a Gemini 2.5 Flash
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

    const coachData = JSON.parse(generatedText.trim());
    return NextResponse.json(coachData);
  } catch (error: any) {
    console.error("[Coach AI API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar la sugerencia de IA." },
      { status: 500 }
    );
  }
}
