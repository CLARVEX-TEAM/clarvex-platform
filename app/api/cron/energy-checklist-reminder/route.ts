import { NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { isEnergyChecklistDay } from "@/lib/operational-checklist-reminders";
import { prisma } from "@/lib/prisma";
import { avisar } from "@/lib/whatsapp-canal";
import { filterUsersWithoutAlert, recordRetailAlerts, RETAIL_ALERT_TYPES } from "@/lib/retail-alert-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Recordatorio de lunes, miércoles y viernes, 45 minutos antes de la 1:00. */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const today = resolveMonterreyDate();
  if (!isEnergyChecklistDay(today.weekday)) {
    return NextResponse.json({ ok: true, date: today.dateKey, sent: 0, message: "Hoy no toca checklist de energía." });
  }

  const stores = await prisma.store.findMany({
    where: { energyChecklistReminderEnabled: true },
    select: { id: true }
  });
  let sent = 0;
  let completed = 0;

  for (const store of stores) {
    const [managers, energyItem] = await Promise.all([
      prisma.user.findMany({
        where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
        select: { id: true }
      }),
      prisma.checklistItem.findFirst({
        where: { storeId: store.id, active: true, label: { contains: "energ", mode: "insensitive" } },
        select: { key: true }
      })
    ]);

    // Si la tienda añadió el punto a su checklist y ya está marcado, el aviso
    // se omite. Si el checklist de energía vive fuera de Clarvex, se recuerda
    // igualmente y gerencia lo realiza en su sistema habitual.
    if (energyItem) {
      const done = await prisma.checklistEntry.findUnique({
        where: { storeId_date_itemKey: { storeId: store.id, date: today.dateKey, itemKey: energyItem.key } },
        select: { completed: true }
      });
      if (done?.completed) {
        completed += 1;
        continue;
      }
    }

    const managerIds = managers.map((manager) => manager.id);
    if (managerIds.length === 0) continue;
    const title = "Checklist de energía";
    const body = "Hoy corresponde realizarlo. Complétalo antes de la 1:00 p. m.";

    const recipients = await prisma.$transaction(async (tx) => {
      const pending = await filterUsersWithoutAlert(tx, {
        storeId: store.id,
        userIds: managerIds,
        periodKey: today.dateKey,
        alertType: RETAIL_ALERT_TYPES.ENERGY_CHECKLIST_1215
      });
      if (pending.length === 0) return [];
      const notifications: NotificationInput[] = pending.map((userId) => ({
        storeId: store.id,
        userId,
        type: NotificationType.CHECKLIST_REMINDER,
        title,
        body
      }));
      await createNotifications(tx, notifications);
      await recordRetailAlerts(tx, {
        storeId: store.id,
        userIds: pending,
        periodKey: today.dateKey,
        alertType: RETAIL_ALERT_TYPES.ENERGY_CHECKLIST_1215
      });
      return pending;
    });

    if (recipients.length === 0) continue;
    await avisar(recipients, {
      title,
      body,
      tag: "checklist-energia",
      url: "/checklist"
    }).catch(() => undefined);
    sent += recipients.length;
  }

  return NextResponse.json({ ok: true, date: today.dateKey, stores: stores.length, completed, sent });
}
