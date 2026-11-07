import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildPendingOverdueManagersSummary } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { avisar } from "@/lib/whatsapp-canal";
import { prisma } from "@/lib/prisma";
import { filterUsersWithoutAlert, recordRetailAlerts, RETAIL_ALERT_TYPES } from "@/lib/retail-alert-log";
import { NotificationType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "pendientes-vencidos-gerencia";
const DAY_MS = 86_400_000;

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate } = resolveMonterreyDate();
  const todayStart = utcDate.getTime();
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = {
    date: dateKey,
    stores: stores.length,
    managersNotified: 0,
    overduePendings: 0,
    storesSkipped: 0
  };

  for (const store of stores) {
    const [managers, pendings] = await Promise.all([
      prisma.user.findMany({
        where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
        select: { id: true }
      }),
      prisma.pending.findMany({
        where: { storeId: store.id, status: { not: "COMPLETADO" }, dueDate: { lt: utcDate } },
        select: { title: true, dueDate: true, owner: { select: { name: true } } },
        orderBy: { dueDate: "asc" }
      })
    ]);

    if (managers.length === 0 || pendings.length === 0) {
      summary.storesSkipped += 1;
      continue;
    }

    summary.overduePendings += pendings.length;
    const overdue = pendings.map((pending) => ({
      title: pending.title,
      ownerName: pending.owner.name,
      daysOverdue: Math.max(1, Math.ceil((todayStart - pending.dueDate.getTime()) / DAY_MS))
    }));
    const message = buildPendingOverdueManagersSummary({ overdue });
    const managerIds = managers.map((manager) => manager.id);

    const recipients = await prisma.$transaction(async (tx) => {
      const pendingRecipients = await filterUsersWithoutAlert(tx, {
        storeId: store.id,
        userIds: managerIds,
        periodKey: dateKey,
        alertType: RETAIL_ALERT_TYPES.PENDING_OVERDUE_MGR
      });
      if (pendingRecipients.length === 0) return [];

      const notifications: NotificationInput[] = pendingRecipients.map((userId) => ({
        storeId: store.id,
        userId,
        type: NotificationType.PENDING_ASSIGNED,
        title: message.title,
        body: message.body
      }));

      await createNotifications(tx, notifications);
      await recordRetailAlerts(tx, {
        storeId: store.id,
        userIds: pendingRecipients,
        periodKey: dateKey,
        alertType: RETAIL_ALERT_TYPES.PENDING_OVERDUE_MGR
      });
      return pendingRecipients;
    });

    if (recipients.length === 0) continue;

    await avisar(recipients, {
      title: message.title,
      body: message.body,
      tag: PUSH_TAG,
      url: "/pendientes"
    }).catch(() => undefined);
    summary.managersNotified += recipients.length;
  }

  return NextResponse.json(summary);
}
