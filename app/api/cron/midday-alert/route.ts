import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildMiddayAdvisorMessage, buildMiddayManagerSummary } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { syncAllSources } from "@/lib/data-source-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sincroniza los datos antes de avisar: incluye la sync (varios min) + el envío.
export const maxDuration = 300;

const PUSH_TAG = "media-jornada";
const LOG_TYPE = "MIDDAY";
const THRESHOLD = 0.5; // por debajo del 50% de la meta del día = atrasado

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Refrescar KPIs/horarios antes de avisar para no mandar datos viejos.
  await syncAllSources().catch(() => undefined);

  const { dateKey, utcDate, dateLabel } = resolveMonterreyDate();
  const thresholdPct = Math.round(THRESHOLD * 100);
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = {
    date: dateKey,
    stores: stores.length,
    advisorsNudged: 0,
    advisorsOnTrack: 0,
    advisorsSkipped: 0,
    managersNotified: 0
  };

  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string } };

  for (const store of stores) {
    const [advisors, managers, dayKpis, daySchedules, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, role: "ASESOR" }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] } }, select: { id: true } }),
      prisma.kpi.findMany({ where: { storeId: store.id, date: utcDate }, select: { userId: true, dailySales: true, dailyGoal: true } }),
      prisma.schedule.findMany({ where: { storeId: store.id, date: utcDate }, select: { userId: true, status: true } }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);

    const kpiByUser = new Map(dayKpis.map((kpi) => [kpi.userId, kpi]));
    const scheduleByUser = new Map(daySchedules.map((schedule) => [schedule.userId, schedule.status]));
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    const storeSales = dayKpis.reduce((total, kpi) => total + Number(kpi.dailySales), 0);
    const storeGoal = dayKpis.reduce((total, kpi) => total + Number(kpi.dailyGoal), 0);

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: PushJob[] = [];
    const behind: Array<{ name: string; sales: number; goal: number }> = [];

    for (const advisor of advisors) {
      // Solo asesores trabajando hoy con meta del día.
      const scheduleStatus = scheduleByUser.get(advisor.id);
      if (scheduleStatus && scheduleStatus !== "WORKING") {
        summary.advisorsSkipped += 1;
        continue;
      }
      const kpi = kpiByUser.get(advisor.id);
      const goal = kpi ? Number(kpi.dailyGoal) : 0;
      if (goal <= 0) {
        summary.advisorsSkipped += 1;
        continue;
      }
      const sales = kpi ? Number(kpi.dailySales) : 0;
      const onTrack = sales / goal >= THRESHOLD;
      if (onTrack) {
        summary.advisorsOnTrack += 1;
        continue;
      }

      // Atrasado: cuenta para el resumen de gerencia aunque ya se le haya avisado.
      behind.push({ name: advisor.name, sales, goal });
      if (alreadySent.has(advisor.id)) {
        summary.advisorsSkipped += 1;
        continue;
      }
      const message = buildMiddayAdvisorMessage({ name: advisor.name, sales, goal });
      notifications.push({ storeId: store.id, userId: advisor.id, type: NotificationType.DAILY_SUMMARY, title: message.title, body: message.body });
      logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      pushJobs.push({ userIds: [advisor.id], payload: { title: message.title, body: message.body, tag: PUSH_TAG } });
      summary.advisorsNudged += 1;
    }

    // Resumen de media jornada para gerencia.
    const managerIds = managers.map((manager) => manager.id).filter((id) => !alreadySent.has(id));
    if (managerIds.length > 0) {
      const managerMessage = buildMiddayManagerSummary({ dateLabel, storeSales, storeGoal, thresholdPct, behind });
      for (const id of managerIds) {
        notifications.push({ storeId: store.id, userId: id, type: NotificationType.DAILY_SUMMARY, title: managerMessage.title, body: managerMessage.body });
        logsToCreate.push({ employeeId: id, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      }
      pushJobs.push({ userIds: managerIds, payload: { title: managerMessage.title, body: managerMessage.body, tag: PUSH_TAG } });
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
