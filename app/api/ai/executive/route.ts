import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";
import { resolveMonterreyDate } from "@/lib/cron-time";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE", "REGIONAL"]);
  if (isApiError(session)) return session;

  try {
    const todayInfo = resolveMonterreyDate();
    const yesterday = new Date(todayInfo.utcDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Evaluate recent plans outcomes first to feed operational memory
    await ClarvexIntelligence.evaluatePlanOutcomes(session.storeId).catch((err) => {
      console.error("[Evaluate Plan Outcomes Error]:", err);
    });

    const [health, predictions, dailySummary] = await Promise.all([
      ClarvexIntelligence.getExecutiveHealth(session),
      ClarvexIntelligence.predictMetrics(session),
      ClarvexIntelligence.generateDailySummary(session, yesterdayStr, false),
    ]);

    return NextResponse.json({ health, predictions, dailySummary });
  } catch (error: any) {
    console.error("[Executive Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al generar el panel ejecutivo IA." },
      { status: 500 }
    );
  }
}
