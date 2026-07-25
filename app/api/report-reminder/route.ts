import { NextResponse } from "next/server";
import { z } from "zod";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { reminderForStore } from "@/lib/services/report-reminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/report-reminder
 *
 * El recordatorio de entrega vigente para la tienda, o null si hoy no toca o ya
 * se confirmó. Es lo que pinta el aviso en /asistencia con el botón de confirmar.
 */
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const today = resolveMonterreyDate();
  const reminder = await reminderForStore(session.storeId, today.utcDate);
  return NextResponse.json({ reminder });
}

const confirmSchema = z.object({
  /** periodKey del recordatorio que se está confirmando (viene del GET). */
  periodKey: z.string().min(1).max(64)
});

/**
 * POST /api/report-reminder
 *
 * "Ya lo subí a Blitz": deja de avisar por ESA entrega. No silencia las
 * siguientes — la confirmación se guarda contra el periodKey del cierre.
 */
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, confirmSchema);
  if ("response" in parsed) return parsed.response;

  const today = resolveMonterreyDate();
  const reminder = await reminderForStore(session.storeId, today.utcDate);
  // Solo se confirma la entrega que está avisando ahora. Sin esta validación se
  // podría marcar por adelantado un cierre futuro y quedarse sin aviso.
  if (!reminder || reminder.periodKey !== parsed.data.periodKey) {
    return NextResponse.json({ error: "Ese recordatorio ya no está activo." }, { status: 409 });
  }

  await prisma.reportDelivery.upsert({
    where: { storeId_periodKey: { storeId: session.storeId, periodKey: reminder.periodKey } },
    update: {},
    create: {
      storeId: session.storeId,
      kind: reminder.kind,
      periodKey: reminder.periodKey,
      dueDate: reminder.dueDate,
      confirmedById: session.userId
    }
  });

  await recordAudit({
    session,
    action: "reportDelivery.confirm",
    entity: "ReportDelivery",
    entityId: reminder.periodKey,
    storeId: session.storeId,
    detail: `${reminder.kind} con vencimiento ${reminder.dueDate}`
  });

  return NextResponse.json({ ok: true, confirmed: reminder.periodKey });
}
