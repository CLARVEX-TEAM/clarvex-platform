import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { NotificationType } from "@prisma/client";
import { yearsSince } from "@/lib/celebrations";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { firstName } from "@/lib/daily-summary";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { avisar } from "@/lib/whatsapp-canal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUSH_TAG = "festejo";
const LOG_TYPE = "CELEBRATION";

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const { dateKey } = resolveMonterreyDate();
  const mmdd = dateKey.slice(5);
  const stores = await prisma.store.findMany({ select: { id: true } });

  const summary = { date: dateKey, birthdays: 0, anniversaries: 0 };
  type PushJob = { userIds: string[]; payload: { title: string; body: string; tag: string } };

  for (const store of stores) {
    const [users, sentLogs] = await Promise.all([
      prisma.user.findMany({ where: { storeId: store.id, active: true }, select: { id: true, name: true, birthDate: true, hireDate: true } }),
      prisma.dailyNotificationLog.findMany({ where: { date: dateKey, type: LOG_TYPE }, select: { employeeId: true } })
    ]);
    const alreadySent = new Set(sentLogs.map((log) => log.employeeId));
    const allUserIds = users.map((user) => user.id);

    const notifications: NotificationInput[] = [];
    const logsToCreate: Array<{ employeeId: string; date: string; type: string; case: string | null; sent: boolean }> = [];
    const pushJobs: PushJob[] = [];

    for (const user of users) {
      if (alreadySent.has(user.id)) continue;
      const isBirthday = user.birthDate ? user.birthDate.toISOString().slice(5, 10) === mmdd : false;
      const hireKey = user.hireDate ? user.hireDate.toISOString().slice(0, 10) : null;
      const anniversaryYears = hireKey && hireKey.slice(5) === mmdd ? yearsSince(hireKey, dateKey) : 0;
      const isAnniversary = anniversaryYears >= 1;
      if (!isBirthday && !isAnniversary) continue;

      const name = firstName(user.name);
      let title: string;
      let teamBody: string;
      let personalBody: string;
      let caseLabel: string;

      if (isBirthday) {
        title = "🎂 Cumpleaños";
        teamBody = `🎂 ¡Hoy es el cumpleaños de ${name}! Mándale tus buenos deseos. 🎉`;
        personalBody = `🎂 ¡Feliz cumpleaños, ${name}! Todo el equipo te desea un excelente día. 🎉`;
        caseLabel = "cumple";
        summary.birthdays += 1;
      } else {
        title = "🎉 Aniversario";
        teamBody = `🎉 ¡${name} cumple ${anniversaryYears} ${anniversaryYears === 1 ? "año" : "años"} en el equipo hoy! 👏`;
        personalBody = `🎉 ¡Felicidades ${name}! Hoy cumples ${anniversaryYears} ${anniversaryYears === 1 ? "año" : "años"} con nosotros. Gracias por tu trabajo. 💙`;
        caseLabel = "aniversario";
        summary.anniversaries += 1;
      }

      const teamIds = allUserIds.filter((id) => id !== user.id);
      for (const id of teamIds) {
        notifications.push({ storeId: store.id, userId: id, type: NotificationType.CELEBRATION, title, body: teamBody });
      }
      notifications.push({ storeId: store.id, userId: user.id, type: NotificationType.CELEBRATION, title, body: personalBody });
      if (teamIds.length > 0) pushJobs.push({ userIds: teamIds, payload: { title, body: teamBody, tag: PUSH_TAG } });
      pushJobs.push({ userIds: [user.id], payload: { title, body: personalBody, tag: PUSH_TAG } });
      logsToCreate.push({ employeeId: user.id, date: dateKey, type: LOG_TYPE, case: caseLabel, sent: true });
    }

    if (notifications.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, notifications);
      await tx.dailyNotificationLog.createMany({ data: logsToCreate, skipDuplicates: true });
    });

    await Promise.allSettled(
      pushJobs.map((job) => avisar(job.userIds, job.payload).catch(() => undefined))
    );
  }

  return NextResponse.json(summary);
}
