import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";
import { resolveMonterreyDate } from "@/lib/cron-time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Permitimos a todos los roles autenticados (ASESOR, GERENTE, SUBGERENTE, REGIONAL)
  const session = await requireSession(["GERENTE", "SUBGERENTE", "ASESOR", "REGIONAL"]);
  if (isApiError(session)) return session;

  try {
    const todayInfo = resolveMonterreyDate();
    
    // Calcular el día anterior
    const yesterday = new Date(todayInfo.utcDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const defaultYesterdayStr = yesterday.toISOString().slice(0, 10);

    const params = new URL(request.url).searchParams;
    const dateStr = params.get("date") || defaultYesterdayStr;

    // Protección de seguridad: prohibido consultar el día actual o días futuros
    if (dateStr >= todayInfo.dateKey) {
      return NextResponse.json(
        { error: "No se permite consultar el resumen del día actual o días futuros ya que la jornada no está cerrada." },
        { status: 400 }
      );
    }

    const summary = await ClarvexIntelligence.generateDailySummary(session, dateStr, false);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[Daily Summary AI Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar el resumen diario con IA." },
      { status: 500 }
    );
  }
}
