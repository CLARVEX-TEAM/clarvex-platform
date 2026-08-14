import { ADVISOR_WHERE } from "@/lib/store-people";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildAdvisorMessage, buildManagerSummary } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const PUSH_TAG = "cierre-dia";
const LOG_TYPE = "EVENING";

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate, dateLabel } = resolveMonterreyDate();
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = {
    date: dateKey,
    stores: stores.length,
    advisorsNotified: 0,
    advisorsSkipped: 0,
    managersNotified: 0,
    byCase: {} as Record<string, number>
  };

  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string; url: string } };

  for (const store of stores) {
    const [advisors, managers, dayKpis, daySchedules, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, ...ADVISOR_WHERE }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } }),
      prisma.kpi.findMany({ where: { storeId: store.id, date: utcDate }, select: { userId: true, dailySales: true, dailyGoal: true } }),
      prisma.schedule.findMany({ where: { storeId: store.id, date: utcDate }, select: { userId: true, status: true } }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);

    const kpiByUser = new Map(dayKpis.map((kpi) => [kpi.userId, kpi]));
    const scheduleByUser = new Map(daySchedules.map((schedule) => [schedule.userId, schedule.status]));
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    // Totales de tienda del día (TOTALES = suma de todos los colaboradores)
    const storeSales = dayKpis.reduce((total, kpi) => total + Number(kpi.dailySales), 0);
    const storeGoal = dayKpis.reduce((total, kpi) => total + Number(kpi.dailyGoal), 0);

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: PushJob[] = [];
    let overGoal = 0;
    let near = 0;
    let below = 0;

    for (const advisor of advisors) {
      if (alreadySent.has(advisor.id)) {
        summary.advisorsSkipped += 1;
        continue;
      }
      // Caso G — día de descanso (no trabajó según horario): no enviar, registrar.
      const scheduleStatus = scheduleByUser.get(advisor.id);
      if (scheduleStatus && scheduleStatus !== "WORKING") {
        logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: "G", sent: false });
        summary.advisorsSkipped += 1;
        continue;
      }

      const kpi = kpiByUser.get(advisor.id);
      const sales = kpi ? Number(kpi.dailySales) : 0;
      const goal = kpi ? Number(kpi.dailyGoal) : 0;
      const message = buildAdvisorMessage({ name: advisor.name, sales, goal });

      notifications.push({
        storeId: store.id,
        userId: advisor.id,
        type: NotificationType.DAILY_SUMMARY,
        title: message.title,
        body: message.body
      });
      logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: message.case, sent: true });
      pushJobs.push({ userIds: [advisor.id], payload: { title: message.title, body: message.body, tag: PUSH_TAG, url: "/kpis" } });

      if (message.case === "A" || message.case === "B") overGoal += 1;
      else if (message.case === "C") near += 1;
      else below += 1; // D, E, F

      summary.byCase[message.case] = (summary.byCase[message.case] ?? 0) + 1;
      summary.advisorsNotified += 1;
    }

    // Resumen para gerente / subgerente
    const managerIds = managers.map((manager) => manager.id).filter((id) => !alreadySent.has(id));
    if (managerIds.length > 0) {
      const managerMessage = buildManagerSummary({ dateLabel, storeSales, storeGoal, overGoal, near, below });
      for (const id of managerIds) {
        notifications.push({
          storeId: store.id,
          userId: id,
          type: NotificationType.DAILY_SUMMARY,
          title: managerMessage.title,
          body: managerMessage.body
        });
        logsToCreate.push({ employeeId: id, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      }
      pushJobs.push({ userIds: managerIds, payload: { title: managerMessage.title, body: managerMessage.body, tag: PUSH_TAG, url: "/kpis" } });
      summary.managersNotified += managerIds.length;
    }

    if (notifications.length === 0 && logsToCreate.length === 0) continue;

    // Persistir notificaciones internas + log de idempotencia en una sola transacción.
    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      if (logsToCreate.length > 0) {
        await tx.dailyNotificationLog.createMany({ data: logsToCreate, skipDuplicates: true });
      }
    });

    // El push se envía fuera de la transacción y nunca tumba la operación.
    await Promise.allSettled(
      pushJobs.map((job) => dispatchPushToUsers(job.userIds, job.payload).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
