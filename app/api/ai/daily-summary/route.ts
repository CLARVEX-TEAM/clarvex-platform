import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";
import { resolveMonterreyDate } from "@/lib/cron-time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  try {
    const { dateKey } = resolveMonterreyDate();
    const params = new URL(request.url).searchParams;
    const dateStr = params.get("date") || dateKey;

    const summary = await ClarvexIntelligence.generateDailySummary(session, dateStr);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[Daily Summary AI Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al generar el resumen diario con IA." },
      { status: 500 }
    );
  }
}
