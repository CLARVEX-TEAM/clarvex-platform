import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildPendingDueReminder } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "pendiente-vence";
const LOG_TYPE = "PENDING_DUE";
const DAY_MS = 86_400_000;

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate } = resolveMonterreyDate();
  const todayStart = utcDate.getTime();
  const tomorrowStart = todayStart + DAY_MS;
  const dayAfterTomorrow = new Date(todayStart + 2 * DAY_MS);
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = { date: dateKey, stores: stores.length, ownersNotified: 0, pendingsConsidered: 0 };

  for (const store of stores) {
    const [pendings, sentLogs] = await Promise.all([
      prisma.pending.findMany({
        where: { storeId: store.id, status: { not: "COMPLETADO" }, dueDate: { lt: dayAfterTomorrow } },
        select: { title: true, ownerId: true, dueDate: true }
      }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);
    if (pendings.length === 0) continue;
    summary.pendingsConsidered += pendings.length;
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    // Agrupa por responsable, clasificando por urgencia.
    const byOwner = new Map<string, { overdue: string[]; today: string[]; tomorrow: string[] }>();
    for (const pending of pendings) {
      const due = pending.dueDate.getTime();
      const bucket = byOwner.get(pending.ownerId) ?? { overdue: [], today: [], tomorrow: [] };
      if (due < todayStart) bucket.overdue.push(pending.title);
      else if (due < tomorrowStart) bucket.today.push(pending.title);
      else bucket.tomorrow.push(pending.title);
      byOwner.set(pending.ownerId, bucket);
    }

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: Array<{ userId: string; title: string; body: string }> = [];

    for (const [ownerId, bucket] of Array.from(byOwner.entries())) {
      if (alreadySent.has(ownerId)) continue;
      if (bucket.overdue.length + bucket.today.length + bucket.tomorrow.length === 0) continue;
      const message = buildPendingDueReminder(bucket);
      notifications.push({ storeId: store.id, userId: ownerId, type: NotificationType.PENDING_ASSIGNED, title: message.title, body: message.body });
      logsToCreate.push({ employeeId: ownerId, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      pushJobs.push({ userId: ownerId, title: message.title, body: message.body });
    }

    if (notifications.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.createMany({ data: logsToCreate, skipDuplicates: true });
    });

    await Promise.allSettled(pushJobs.map((job) => dispatchPushToUsers([job.userId], { title: job.title, body: job.body, tag: PUSH_TAG, url: "/pendientes" }).catch(() => undefined)));
    summary.ownersNotified += pushJobs.length;
  }

  return NextResponse.json(summary);
}
