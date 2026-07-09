import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  try {
    const body = await request.json().catch(() => ({}));
    const date = body.date || new Date().toISOString().slice(0, 10);
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "Debe seleccionar un asesor para generar su plan personalizado." },
        { status: 400 }
      );
    }

    const plan = await ClarvexIntelligence.generateDailyPlan(session, userId, date);
    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("[Plan AI API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar la sugerencia de IA." },
      { status: 500 }
    );
  }
}
