import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { buildCaptureAlertMessage, findStoresNeedingCapture, type StoreCaptureState } from "@/lib/capture-freshness";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { avisar } from "@/lib/whatsapp-canal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "captura-pendiente";
const LOG_TYPE = "CAPTURE_STALE";

/**
 * Avisa a gerencia cuando una tienda lleva días sin capturar.
 *
 * Reemplaza a `sync-alert`, que vigilaba los enlaces de Excel de Axo y quedó
 * como no-op al retirarlos. El riesgo no se fue con ellos: ahora los datos
 * dependen de que una persona capture cada día, y un olvido no produce ningún
 * error —solo KPIs quietos y decisiones tomadas sobre datos viejos.
 *
 * Solo se avisa UNA VEZ AL DÍA por persona (`DailyNotificationLog`), como el
 * resto de alertas: repetirlo cada corrida convertiría el aviso en ruido y
 * dejaría de leerse justo cuando importa.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate } = resolveMonterreyDate();

  // Solo tiendas con KPIs activos: una tienda con el módulo apagado no tiene
  // nada que capturar y avisarle sería ruido puro.
  const stores = await prisma.store.findMany({
    where: { kpisEnabled: true },
    select: { id: true, name: true }
  });

  const states: StoreCaptureState[] = [];
  for (const store of stores) {
    // Último día CON VENTA, ignorando filas futuras: el criterio es el mismo
    // que usaba la alarma del RDV, para que "congelado" signifique lo mismo.
    const latest = await prisma.kpi.findFirst({
      where: { storeId: store.id, date: { lte: utcDate }, dailySales: { gt: 0 } },
      orderBy: { date: "desc" },
      select: { date: true }
    });
    states.push({ storeId: store.id, storeName: store.name, latestSaleDate: latest?.date ?? null });
  }

  const alerts = findStoresNeedingCapture(utcDate, states);

  const summary = {
    date: dateKey,
    storesChecked: stores.length,
    storesStale: alerts.length,
    managersNotified: 0,
    stores: alerts.map((alert) => ({ store: alert.storeName, daysStale: alert.daysStale }))
  };

  for (const alert of alerts) {
    const [managers, sentLogs] = await Promise.all([
      prisma.user.findMany({
        where: { storeId: alert.storeId, active: true, role: { in: ["GERENTE", "SUBGERENTE"] } },
        select: { id: true }
      }),
      prisma.dailyNotificationLog.findMany({
        where: { date: dateKey, type: LOG_TYPE },
        select: { employeeId: true }
      })
    ]);
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));
    const managerIds = managers.map((manager) => manager.id).filter((id) => !alreadySent.has(id));
    if (managerIds.length === 0) continue;

    const message = buildCaptureAlertMessage(alert);
    const notifications: NotificationInput[] = managerIds.map((id) => ({
      storeId: alert.storeId,
      userId: id,
      type: NotificationType.DAILY_SUMMARY,
      title: message.title,
      body: message.body
    }));

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.createMany({
        data: managerIds.map((id) => ({ employeeId: id, date: dateKey, type: LOG_TYPE, case: null, sent: true })),
        skipDuplicates: true
      });
    });

    // El push no debe tumbar la alarma: la notificación en la app ya quedó.
    await avisar(managerIds, {
      title: message.title,
      body: message.body,
      tag: PUSH_TAG,
      url: "/escritorio/captura"
    }).catch(() => undefined);
    summary.managersNotified += managerIds.length;
  }

  return NextResponse.json(summary);
}
