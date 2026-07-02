import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { buildGoalReachedMessage } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "meta-alcanzada";
const LOG_TYPE = "GOAL_REACHED";

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate } = resolveMonterreyDate();
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = { date: dateKey, stores: stores.length, celebrated: 0 };

  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string; url: string } };

  for (const store of stores) {
    const [advisors, dayKpis, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, role: "ASESOR" }, select: { id: true, name: true } }),
      prisma.kpi.findMany({ where: { storeId: store.id, date: utcDate }, select: { userId: true, dailySales: true, dailyGoal: true } }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);

    const kpiByUser = new Map(dayKpis.map((kpi) => [kpi.userId, kpi]));
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: PushJob[] = [];

    for (const advisor of advisors) {
      if (alreadySent.has(advisor.id)) continue;
      const kpi = kpiByUser.get(advisor.id);
      if (!kpi) continue;
      const goal = Number(kpi.dailyGoal);
      const sales = Number(kpi.dailySales);
      if (goal <= 0 || sales < goal) continue; // aún no cruza el 100%

      const message = buildGoalReachedMessage({ name: advisor.name, sales, goal });
      notifications.push({ storeId: store.id, userId: advisor.id, type: NotificationType.KPI_GOAL_REACHED, title: message.title, body: message.body });
      logsToCreate.push({ employeeId: advisor.id, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      pushJobs.push({ userIds: [advisor.id], payload: { title: message.title, body: message.body, tag: PUSH_TAG, url: "/kpis" } });
      summary.celebrated += 1;
    }

    if (notifications.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.createMany({ data: logsToCreate, skipDuplicates: true });
    });

    await Promise.allSettled(
      pushJobs.map((job) => dispatchPushToUsers(job.userIds, job.payload).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
