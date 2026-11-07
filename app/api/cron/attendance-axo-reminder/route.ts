import { NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { axoAttendancePeriodKey } from "@/lib/operational-checklist-reminders";
import { prisma } from "@/lib/prisma";
import { avisar } from "@/lib/whatsapp-canal";
import { filterUsersWithoutAlert, recordRetailAlerts, RETAIL_ALERT_TYPES } from "@/lib/retail-alert-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Avisa solo a gerencia de las tiendas que tienen Forms configurado y aún no
 * confirmaron el envío de hoy. `stage=1050` es la última llamada antes de las
 * 11:00; lleva otro tipo de alerta para no quedar silenciada por la de 10:30.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const stage = new URL(request.url).searchParams.get("stage") === "1050" ? "1050" : "1030";
  const alertType = stage === "1050"
    ? RETAIL_ALERT_TYPES.AXO_ATTENDANCE_1050
    : RETAIL_ALERT_TYPES.AXO_ATTENDANCE_1030;
  const today = resolveMonterreyDate();
  const periodKey = axoAttendancePeriodKey(today.dateKey);
  const stores = await prisma.store.findMany({
    where: { attendanceFormUrl: { not: null } },
    select: { id: true }
  });

  let sent = 0;
  let confirmed = 0;
  for (const store of stores) {
    const [delivery, managers] = await Promise.all([
      prisma.reportDelivery.findUnique({
        where: { storeId_periodKey: { storeId: store.id, periodKey } },
        select: { id: true }
      }),
      prisma.user.findMany({
        where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] }, active: true },
        select: { id: true }
      })
    ]);
    if (delivery) {
      confirmed += 1;
      continue;
    }
    const managerIds = managers.map((manager) => manager.id);
    if (managerIds.length === 0) continue;

    const title = stage === "1050" ? "Último aviso: asistencia AXO" : "Asistencia AXO pendiente";
    const body = stage === "1050"
      ? "Faltan 10 minutos. Envía el Forms de asistencia y confírmalo en Clarvex antes de las 11:00."
      : "Prepara las fotos del POS y del equipo, envía el Forms y confírmalo antes de las 11:00.";

    const recipients = await prisma.$transaction(async (tx) => {
      const pending = await filterUsersWithoutAlert(tx, {
        storeId: store.id,
        userIds: managerIds,
        periodKey: today.dateKey,
        alertType
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
        alertType
      });
      return pending;
    });

    if (recipients.length === 0) continue;
    await avisar(recipients, {
      title,
      body,
      tag: `asistencia-axo-${stage}`,
      url: "/checklist"
    }).catch(() => undefined);
    sent += recipients.length;
  }

  return NextResponse.json({ ok: true, date: today.dateKey, stage, stores: stores.length, confirmed, sent });
}
