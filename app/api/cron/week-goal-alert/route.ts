import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { cronManagerSession } from "@/lib/cron-store-session";
import { buildWeekGoal100Message, buildWeekGoal80Message } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";
import {
  filterUsersWithoutAlert,
  recordRetailAlerts,
  RETAIL_ALERT_TYPES,
  weekGoalPeriodKey
} from "@/lib/retail-alert-log";
import { getKpiReport } from "@/lib/services/kpi-service";
import { NotificationType } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG_80 = "meta-semanal-80";
const PUSH_TAG_100 = "meta-semanal-100";
const MILESTONE_80 = 80;
const MILESTONE_100 = 100;

function formatWeekLabel(weekNumber: number | null, startDate: string, endDate: string): string {
  if (weekNumber !== null) return `${weekNumber} (${startDate} → ${endDate})`;
  return `${startDate} → ${endDate}`;
}

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey, utcDate } = resolveMonterreyDate();
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = {
    date: dateKey,
    stores: stores.length,
    alerted80: 0,
    alerted100: 0,
    skipped: 0
  };

  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string; url: string } };

  for (const store of stores) {
    const managers = await prisma.user.findMany({
      where: { storeId: store.id, role: { in: ["GERENTE", "SUBGERENTE"] } },
      select: { id: true, role: true, name: true, employeeNumber: true }
    });
    if (managers.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const lead = managers.find((manager) => manager.role === "GERENTE") ?? managers[0];
    const report = await getKpiReport(
      cronManagerSession({
        userId: lead.id,
        storeId: store.id,
        role: lead.role,
        name: lead.name,
        employeeNumber: lead.employeeNumber
      }),
      { period: "week", selectedDate: utcDate }
    );

    const storeKpi = report.store;
    if (!storeKpi || storeKpi.goal <= 0) {
      summary.skipped += 1;
      continue;
    }

    const achievement = storeKpi.achievement;
    const periodKey = weekGoalPeriodKey(report.weekNumber, report.startDate, report.endDate);
    const weekLabel = formatWeekLabel(report.weekNumber, report.startDate, report.endDate);
    const managerIds = managers.map((manager) => manager.id);

    const milestones: Array<{
      threshold: number;
      alertType: (typeof RETAIL_ALERT_TYPES)[keyof typeof RETAIL_ALERT_TYPES];
      tag: string;
      build: () => { title: string; body: string };
    }> = [];

    if (achievement >= MILESTONE_100) {
      milestones.push({
        threshold: MILESTONE_100,
        alertType: RETAIL_ALERT_TYPES.WEEK_GOAL_100,
        tag: PUSH_TAG_100,
        build: () => buildWeekGoal100Message({ weekLabel, sales: storeKpi.sales, goal: storeKpi.goal })
      });
    } else if (achievement >= MILESTONE_80) {
      milestones.push({
        threshold: MILESTONE_80,
        alertType: RETAIL_ALERT_TYPES.WEEK_GOAL_80,
        tag: PUSH_TAG_80,
        build: () => buildWeekGoal80Message({ weekLabel, sales: storeKpi.sales, goal: storeKpi.goal })
      });
    } else {
      summary.skipped += 1;
      continue;
    }

    const notifications: NotificationInput[] = [];
    const pushJobs: PushJob[] = [];

    await prisma.$transaction(async (tx) => {
      for (const milestone of milestones) {
        const recipients = await filterUsersWithoutAlert(tx, {
          storeId: store.id,
          userIds: managerIds,
          periodKey,
          alertType: milestone.alertType
        });
        if (recipients.length === 0) continue;

        const message = milestone.build();
        for (const userId of recipients) {
          notifications.push({
            storeId: store.id,
            userId,
            type: NotificationType.KPI_GOAL_REACHED,
            title: message.title,
            body: message.body
          });
        }
        pushJobs.push({
          userIds: recipients,
          payload: { title: message.title, body: message.body, tag: milestone.tag, url: "/kpis" }
        });
        await recordRetailAlerts(tx, {
          storeId: store.id,
          userIds: recipients,
          periodKey,
          alertType: milestone.alertType
        });

        if (milestone.threshold === MILESTONE_100) summary.alerted100 += recipients.length;
        else summary.alerted80 += recipients.length;
      }

      if (notifications.length > 0) {
        await createNotifications(tx, notifications);
      }
    });

    await Promise.allSettled(
      pushJobs.map((job) => dispatchPushToUsers(job.userIds, job.payload).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
