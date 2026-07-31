import { ADVISOR_WHERE } from "@/lib/store-people";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate, retailWeekRange } from "@/lib/cron-time";
import { buildMorningAdvisorMessage, buildMorningManagerSummary } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "arranque-dia";
const LOG_TYPE = "MORNING";

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate, dateLabel, weekday } = resolveMonterreyDate();
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = {
    date: dateKey,
    stores: stores.length,
    advisorsNotified: 0,
    advisorsSkipped: 0,
    managersNotified: 0
  };

  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string; url: string } };

  for (const store of stores) {
    const [advisors, managers, todayRows, workingSchedules, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, ...ADVISOR_WHERE }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } }),
      prisma.kpi.findMany({ where: { storeId: store.id, date: utcDate }, select: { userId: true, dailyGoal: true, dailySales: true } }),
      prisma.schedule.findMany({ where: { storeId: store.id, date: utcDate, status: "WORKING" }, select: { userId: true } }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);

    // Ventana de la semana retail (domingo → sábado) que contiene hoy.
    // Se calcula desde la fecha (mismo rango que la vista semanal de KPIs) en
    // lugar de leer la metadata persistida, que puede venir recortada por cortes
    // de mes retail y colapsar la semana a un solo día.
    const { weekStart, weekEnd } = retailWeekRange(utcDate);

    const weekRows = await prisma.kpi.findMany({
      where: { storeId: store.id, date: { gte: weekStart, lte: weekEnd } },
      select: { userId: true, dailySales: true, dailyGoal: true }
    });

    const todayGoalByUser = new Map(todayRows.map((row) => [row.userId, Number(row.dailyGoal)]));
    const weekSalesByUser = new Map<string, number>();
    const weekGoalByUser = new Map<string, number>();
    for (const row of weekRows) {
      weekSalesByUser.set(row.userId, (weekSalesByUser.get(row.userId) ?? 0) + Number(row.dailySales));
      weekGoalByUser.set(row.userId, (weekGoalByUser.get(row.userId) ?? 0) + Number(row.dailyGoal));
    }

    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));
    const advisorIds = new Set(advisors.map((advisor) => advisor.id));
    const activeAdvisors = workingSchedules.filter((schedule) => advisorIds.has(schedule.userId)).length;

    // Totales de tienda
    const storeDailyGoal = todayRows.reduce((total, row) => total + Number(row.dailyGoal), 0);
    const storeWeeklySales = weekRows.reduce((total, row) => total + Number(row.dailySales), 0);
    const storeWeeklyGoal = weekRows.reduce((total, row) => total + Number(row.dailyGoal), 0);

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: PushJob[] = [];

    for (const advisor of advisors) {
      if (alreadySent.has(advisor.id)) {
        summary.advisorsSkipped += 1;
        continue;
      }
      const dailyGoal = todayGoalByUser.get(advisor.id) ?? 0;
      // Sin meta del día → no enviar, registrar como skipped.
      if (dailyGoal <= 0) {
        logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: "skipped", sent: false });
        summary.advisorsSkipped += 1;
        continue;
      }

      const message = buildMorningAdvisorMessage({
        name: advisor.name,
        dailyGoal,
        weeklySales: weekSalesByUser.get(advisor.id) ?? 0,
        weeklyGoal: weekGoalByUser.get(advisor.id) ?? 0,
        weekday
      });

      notifications.push({
        storeId: store.id,
        userId: advisor.id,
        type: NotificationType.DAILY_SUMMARY,
        title: message.title,
        body: message.body
      });
      logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      pushJobs.push({ userIds: [advisor.id], payload: { title: message.title, body: message.body, tag: PUSH_TAG, url: "/kpis" } });
      summary.advisorsNotified += 1;
    }

    // Resumen matutino para gerente / subgerente
    const managerIds = managers.map((manager) => manager.id).filter((id) => !alreadySent.has(id));
    if (managerIds.length > 0) {
      const managerMessage = buildMorningManagerSummary({ dateLabel, storeDailyGoal, storeWeeklySales, storeWeeklyGoal, activeAdvisors });
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

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      if (logsToCreate.length > 0) {
        await tx.dailyNotificationLog.createMany({ data: logsToCreate, skipDuplicates: true });
      }
    });

    await Promise.allSettled(
      pushJobs.map((job) => dispatchPushToUsers(job.userIds, job.payload).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
