import { NotificationType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { monterreyMinutesOfDay, resolveMonterreyDate } from "@/lib/cron-time";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { NOTIFIABLE_WHERE } from "@/lib/store-people";
import { dispatchPushToUsers } from "@/lib/push";
import { shiftReminderText, shouldSendShiftReminder } from "@/lib/shift-reminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG_TYPE = "SHIFT_REMINDER";

/**
 * Se ejecuta cada 15 minutos y avisa una sola vez cuando faltan entre 45 y 75
 * minutos para el turno. La ventana tolera retrasos del cron sin mandar el
 * aviso después de que la jornada empezó.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const today = resolveMonterreyDate(now);
  const nowMinutes = monterreyMinutesOfDay(now);
  const dayEnd = new Date(today.utcDate.getTime() + 86_400_000);

  const [shifts, sentLogs] = await Promise.all([
    prisma.schedule.findMany({
      where: {
        date: { gte: today.utcDate, lt: dayEnd },
        status: { in: ["WORKING", "INVENTORY"] },
        startTime: { not: null },
        /*
         * ⚠️ `active: true` no bastaba: dejaba pasar al aparato de la tienda y a
         * las cuentas DEMO, que son públicas y compartidas. Este es el único
         * cron que recorre todas las tiendas —los demás parten de una lista ya
         * acotada— así que es el único que podía mandarle un aviso a la demo, y
         * se lo mandó. Ver `NOTIFIABLE_WHERE`.
         */
        user: NOTIFIABLE_WHERE
      },
      select: { userId: true, storeId: true, startTime: true, zone: true }
    }),
    prisma.dailyNotificationLog.findMany({
      where: { date: today.dateKey, type: LOG_TYPE },
      select: { employeeId: true }
    })
  ]);

  const alreadySent = new Set(sentLogs.map((log) => log.employeeId));
  const candidates = shifts.filter((shift) => !alreadySent.has(shift.userId) && shouldSendShiftReminder(shift.startTime, nowMinutes));
  const pushes: Array<{ userId: string; title: string; body: string }> = [];

  for (const shift of candidates) {
    const copy = shiftReminderText(shift.startTime!, shift.zone);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.dailyNotificationLog.create({
          data: { employeeId: shift.userId, date: today.dateKey, type: LOG_TYPE, case: shift.startTime, sent: true }
        });
        await createNotifications(tx, [{
          storeId: shift.storeId,
          userId: shift.userId,
          type: NotificationType.SHIFT_REMINDER,
          title: copy.title,
          body: copy.body
        }]);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
    pushes.push({ userId: shift.userId, ...copy });
  }

  if (pushes.length > 0) {
    await Promise.allSettled(pushes.map((push) => dispatchPushToUsers([push.userId], {
      title: push.title,
      body: push.body,
      tag: `turno-${today.dateKey}`,
      url: "/mi-dia?seccion=jornada"
    })));
  }

  return NextResponse.json({ ok: true, date: today.dateKey, checked: shifts.length, sent: pushes.length });
}
