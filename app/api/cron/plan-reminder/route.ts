import { NextResponse } from "next/server";
import { NotificationType } from "@prisma/client";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { dispatchPushToUsers } from "@/lib/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "plan-pendiente";
const LOG_TYPE = "PLAN_REMINDER";

// Recordatorio (≈7 PM): avisa a cada asesor las actividades de su plan de HOY que
// siguen sin completar, e invita a comentarlas para que gerencia las reasigne mañana.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { dateKey } = resolveMonterreyDate();
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const stores = await prisma.store.findMany({ select: { id: true } });
  const summary = { date: dateKey, stores: stores.length, advisorsReminded: 0, advisorsSkipped: 0 };

  for (const store of stores) {
    const [plans, sentLogs] = await Promise.all([
      prisma.dayPlan.findMany({
        where: { storeId: store.id, date: { gte: dayStart, lt: dayEnd }, publishedAt: { not: null } },
        select: { userId: true, activities: { select: { title: true, completed: true } } }
      }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: Array<{ userId: string; title: string; body: string }> = [];

    for (const plan of plans) {
      const pending = plan.activities.filter((activity) => !activity.completed);
      if (pending.length === 0) continue;
      if (alreadySent.has(plan.userId)) { summary.advisorsSkipped += 1; continue; }

      const list = pending.slice(0, 5).map((activity) => `• ${activity.title}`).join("\n");
      const extra = pending.length > 5 ? `\n…y ${pending.length - 5} más` : "";
      const title = pending.length === 1 ? "Tienes 1 actividad pendiente" : `Tienes ${pending.length} actividades pendientes`;
      const body = `De tu plan de hoy:\n${list}${extra}\n\nSi no terminaste alguna actividad, coméntala y tu gerente te la reasigna mañana para que continúes. 💪`;

      notifications.push({ storeId: store.id, userId: plan.userId, type: NotificationType.PLAN_READY, title, body });
      logsToCreate.push({ employeeId: plan.userId, date: dateKey, type: LOG_TYPE, case: null, sent: true });
      pushJobs.push({ userId: plan.userId, title, body: `${pending.length} pendiente${pending.length === 1 ? "" : "s"} en tu plan. Coméntalas para que te las reasignen mañana.` });
      summary.advisorsReminded += 1;
    }

    if (notifications.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.createMany({ data: logsToCreate, skipDuplicates: true });
    });

    await Promise.allSettled(
      pushJobs.map((job) => dispatchPushToUsers([job.userId], { title: job.title, body: job.body, tag: PUSH_TAG, url: "/plan" }).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
