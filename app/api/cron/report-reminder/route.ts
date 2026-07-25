import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { reminderForStore } from "@/lib/services/report-reminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Recuerda a gerencia las entregas de asistencia.
 *
 * - Faltas: al cierre de cada quincena (día 15 y último del mes).
 * - Retardos, domingos y festivos: 3 días antes del último sábado del MES
 *   RETAIL, y cada día hasta ese sábado.
 *
 * Se resuelve POR TIENDA: el cierre del mes retail sale del RDV de cada tienda y
 * la confirmación de "ya lo subí" también es por tienda, así que un aviso global
 * mandaría la fecha de otra tienda.
 *
 * Corre una vez al día; si no toca avisar, no molesta a nadie. Este es el motivo
 * original de toda la función: que nunca se te pase una fecha de reporte.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const today = resolveMonterreyDate();
  const managers = await prisma.user.findMany({
    where: { role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
    select: { id: true, storeId: true }
  });
  if (managers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Sin gerencia activa." });
  }

  const byStore = new Map<string, string[]>();
  for (const manager of managers) {
    byStore.set(manager.storeId, [...(byStore.get(manager.storeId) ?? []), manager.id]);
  }

  let sent = 0;
  const perStore: Array<{ storeId: string; kind: string; daysLeft: number; dueDate: string; source: string; recipients: number }> = [];

  for (const [storeId, userIds] of byStore) {
    const reminder = await reminderForStore(storeId, today.utcDate);
    if (!reminder) continue;
    await dispatchPushToUsers(userIds, {
      title: reminder.kind === "QUINCENA" ? "📋 Cierre de quincena" : "⏰ Cierre del mes retail",
      body: reminder.message,
      tag: "reporte-asistencia",
      url: "/asistencia"
    }).catch(() => undefined);
    sent += userIds.length;
    perStore.push({
      storeId,
      kind: reminder.kind,
      daysLeft: reminder.daysLeft,
      dueDate: reminder.dueDate,
      source: reminder.source,
      recipients: userIds.length
    });
  }

  if (sent === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Hoy no toca ningún reporte (o ya se confirmó)." });
  }
  return NextResponse.json({ ok: true, sent, stores: perStore });
}
