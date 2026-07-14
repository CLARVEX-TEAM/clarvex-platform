import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { reminderFor } from "@/lib/report-deadlines";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Recuerda a gerencia las entregas de asistencia.
 *
 * - Faltas: al cierre de cada quincena (día 15 y último del mes).
 * - Retardos, domingos y festivos: 3 días antes del último sábado, y ese día.
 *
 * Corre una vez al día; si no toca avisar, no molesta a nadie. Este es el motivo
 * original de toda la función: que nunca se te pase una fecha de reporte.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const today = resolveMonterreyDate();
  const reminder = reminderFor(today.utcDate);
  if (!reminder) {
    return NextResponse.json({ ok: true, sent: 0, message: "Hoy no toca ningún reporte." });
  }

  const managers = await prisma.user.findMany({
    where: { role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
    select: { id: true }
  });
  if (managers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Sin gerencia activa." });
  }

  await dispatchPushToUsers(managers.map((manager) => manager.id), {
    title: reminder.kind === "QUINCENA" ? "📋 Cierre de quincena" : "⏰ Reporte del mes",
    body: reminder.message,
    tag: "reporte-asistencia",
    url: "/asistencia"
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, sent: managers.length, reminder });
}
