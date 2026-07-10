import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Solo permitimos GERENTE o SUBGERENTE
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  try {
    const todayInfo = resolveMonterreyDate();
    
    // Calcular el día anterior
    const yesterday = new Date(todayInfo.utcDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const defaultYesterdayStr = yesterday.toISOString().slice(0, 10);

    const body = await request.json().catch(() => ({}));
    const dateStr = body.date || defaultYesterdayStr;

    // Protección de seguridad: prohibido regenerar el día actual o días futuros
    if (dateStr >= todayInfo.dateKey) {
      return NextResponse.json(
        { error: "No se permite regenerar el resumen del día actual o días futuros ya que la jornada no está cerrada." },
        { status: 400 }
      );
    }

    const summaryDate = new Date(`${dateStr}T12:00:00.000Z`);

    // Consultar el último intento para aplicar el rate limiting (mínimo 15 segundos)
    const existing = await prisma.aiDailySummary.findUnique({
      where: {
        storeId_summaryDate_type_scopeKey: {
          storeId: session.storeId,
          summaryDate,
          type: "STORE_DAILY",
          scopeKey: "STORE"
        }
      }
    });

    if (existing?.generatedAt) {
      const msSinceLastGen = Date.now() - new Date(existing.generatedAt).getTime();
      if (msSinceLastGen < 15000) {
        return NextResponse.json(
          { error: "Por favor espera al menos 15 segundos entre cada regeneración." },
          { status: 429 }
        );
      }
    }

    // Ejecutar regeneración forzada
    const summary = await ClarvexIntelligence.generateDailySummary(session, dateStr, true);

    // Registrar en AuditLog quién regeneró el resumen
    await prisma.auditLog.create({
      data: {
        storeId: session.storeId,
        actorId: session.userId,
        actorName: session.name || "Usuario",
        action: "REGENERATE_AI_SUMMARY",
        entity: "AiDailySummary",
        entityId: summary.id,
        detail: `Resumen de fecha ${dateStr} regenerado manualmente por ${session.role}.`
      }
    });

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[Regenerate Daily Summary AI Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al regenerar el resumen diario con IA." },
      { status: 500 }
    );
  }
}
