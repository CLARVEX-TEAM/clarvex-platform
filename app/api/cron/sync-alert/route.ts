import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Vigila la sincronización del RDV por tienda: si la última sync exitosa
// tiene más de STALE_HOURS o la última terminó en ERROR, avisa a gerencia
// y al admin de plataforma. Sin datos frescos, los KPIs mienten en silencio.

const PUSH_TAG = "sync-alert";
const LOG_TYPE = "SYNC_ALERT";
const STALE_HOURS = 26;

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey } = resolveMonterreyDate();
  const now = Date.now();
  const sources = await prisma.dataSource.findMany({
    where: { type: "KPIS" },
    select: {
      id: true, storeId: true, lastSyncAt: true,
      store: { select: { name: true } },
      syncLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, message: true, createdAt: true } }
    }
  });
  const platformAdmins = await prisma.user.findMany({ where: { platformAdmin: true, active: true }, select: { id: true, storeId: true } });
  const summary = { date: dateKey, sources: sources.length, alerts: 0, healthy: 0, skipped: 0 };

  for (const source of sources) {
    const lastSuccess = await prisma.syncLog.findFirst({
      where: { dataSourceId: source.id, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
    const lastLog = source.syncLogs[0] ?? null;
    const hoursSinceSuccess = lastSuccess ? (now - lastSuccess.createdAt.getTime()) / 3_600_000 : Infinity;
    const failed = lastLog?.status === "ERROR";
    const stale = hoursSinceSuccess > STALE_HOURS;
    if (!failed && !stale) {
      summary.healthy += 1;
      continue;
    }

    const alreadySent = await prisma.dailyNotificationLog.findFirst({ where: { date: dateKey, type: LOG_TYPE, employeeId: source.storeId } });
    if (alreadySent) {
      summary.skipped += 1;
      continue;
    }

    const managers = await prisma.user.findMany({
      where: { storeId: source.storeId, active: true, role: { in: ["GERENTE", "SUBGERENTE"] } },
      select: { id: true }
    });
    const recipients = Array.from(new Set([...managers.map((manager) => manager.id), ...platformAdmins.map((admin) => admin.id)]));
    if (recipients.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const title = `⚠️ Sincronización del RDV — ${source.store.name}`;
    const body = failed
      ? `La última sincronización falló. Revisa el Centro de Datos y vuelve a intentar.`
      : lastSuccess
        ? `Lleva ${Math.floor(hoursSinceSuccess)} h sin sincronizar; los KPIs pueden estar desactualizados. Ejecuta "Sincronizar ahora".`
        : `Nunca se ha sincronizado con éxito. Revisa el enlace en el Centro de Datos.`;

    const notifications: NotificationInput[] = recipients.map((id) => ({
      storeId: source.storeId, userId: id, type: NotificationType.DAILY_SUMMARY, title, body
    }));
    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.create({ data: { employeeId: source.storeId, date: dateKey, type: LOG_TYPE, case: null, sent: true } });
    });
    await dispatchPushToUsers(recipients, { title, body, tag: PUSH_TAG, url: "/datos" }).catch(() => undefined);
    summary.alerts += 1;
  }

  return NextResponse.json(summary);
}
