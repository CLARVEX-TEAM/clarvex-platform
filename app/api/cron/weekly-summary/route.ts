import { ADVISOR_WHERE } from "@/lib/store-people";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate, retailWeekRange } from "@/lib/cron-time";
import { tiendasParaCierreBuenFin } from "@/lib/cierre-buen-fin";
import { buildWeeklyAdvisorMessage, buildWeeklyManagerSummary } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { avisar } from "@/lib/whatsapp-canal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "cierre-semana";
const LOG_TYPE = "WEEKLY";

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" }).format(date).replace(".", "");
}

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const ahora = new Date();
  const fecha = resolveMonterreyDate(ahora);
  const { dateKey, utcDate } = fecha;
  const { weekStart, weekEnd } = retailWeekRange(utcDate);
  const prevWeekEnd = new Date(weekStart);
  prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() - 1);
  const prevWeekStart = new Date(prevWeekEnd);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 6);
  const rangeLabel = `${formatDay(weekStart)} - ${formatDay(weekEnd)}`;

  const stores = await prisma.store.findMany({
    where: tiendasParaCierreBuenFin("semanal", fecha, ahora),
    select: { id: true }
  });

  const summary = {
    date: dateKey,
    week: rangeLabel,
    stores: stores.length,
    advisorsNotified: 0,
    advisorsSkipped: 0,
    managersNotified: 0
  };

  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string; url: string } };

  for (const store of stores) {
    const [advisors, managers, weekRows, prevWeekRows, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, ...ADVISOR_WHERE }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } }),
      prisma.kpi.findMany({ where: { storeId: store.id, date: { gte: weekStart, lte: weekEnd } }, select: { userId: true, dailySales: true, dailyGoal: true } }),
      prisma.kpi.findMany({ where: { storeId: store.id, date: { gte: prevWeekStart, lte: prevWeekEnd } }, select: { userId: true, dailySales: true } }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);

    const salesByUser = new Map<string, number>();
    const goalByUser = new Map<string, number>();
    for (const row of weekRows) {
      salesByUser.set(row.userId, (salesByUser.get(row.userId) ?? 0) + Number(row.dailySales));
      goalByUser.set(row.userId, (goalByUser.get(row.userId) ?? 0) + Number(row.dailyGoal));
    }
    const prevSalesByUser = new Map<string, number>();
    for (const row of prevWeekRows) {
      prevSalesByUser.set(row.userId, (prevSalesByUser.get(row.userId) ?? 0) + Number(row.dailySales));
    }

    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    // Ranking de asesores con actividad en la semana (por venta descendente).
    const ranked = advisors
      .map((advisor) => ({
        id: advisor.id,
        name: advisor.name,
        sales: salesByUser.get(advisor.id) ?? 0,
        goal: goalByUser.get(advisor.id) ?? 0,
        prevSales: prevSalesByUser.get(advisor.id) ?? 0
      }))
      .filter((advisor) => advisor.sales > 0 || advisor.goal > 0)
      .sort((a, b) => b.sales - a.sales);

    const storeSales = weekRows.reduce((total, row) => total + Number(row.dailySales), 0);
    const storeGoal = weekRows.reduce((total, row) => total + Number(row.dailyGoal), 0);
    const prevStoreSales = prevWeekRows.reduce((total, row) => total + Number(row.dailySales), 0);

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: PushJob[] = [];

    ranked.forEach((advisor, index) => {
      if (alreadySent.has(advisor.id)) {
        summary.advisorsSkipped += 1;
        return;
      }
      const message = buildWeeklyAdvisorMessage({
        name: advisor.name,
        sales: advisor.sales,
        goal: advisor.goal,
        rank: index + 1,
        prevSales: advisor.prevSales
      });
      notifications.push({ storeId: store.id, userId: advisor.id, type: NotificationType.DAILY_SUMMARY, title: message.title, body: message.body });
      logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      pushJobs.push({ userIds: [advisor.id], payload: { title: message.title, body: message.body, tag: PUSH_TAG, url: "/kpis" } });
      summary.advisorsNotified += 1;
    });
    // Asesores sin actividad esta semana no reciben resumen.
    summary.advisorsSkipped += advisors.length - ranked.length;

    // Resumen semanal para gerente / subgerente con Top 3.
    const managerIds = managers.map((manager) => manager.id).filter((id) => !alreadySent.has(id));
    if (managerIds.length > 0) {
      const managerMessage = buildWeeklyManagerSummary({
        rangeLabel,
        storeSales,
        storeGoal,
        prevStoreSales,
        top: ranked.slice(0, 3).map((advisor) => ({ name: advisor.name, sales: advisor.sales }))
      });
      for (const id of managerIds) {
        notifications.push({ storeId: store.id, userId: id, type: NotificationType.DAILY_SUMMARY, title: managerMessage.title, body: managerMessage.body });
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
      pushJobs.map((job) => avisar(job.userIds, job.payload).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
