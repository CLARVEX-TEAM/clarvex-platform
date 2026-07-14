import { prisma } from "@/lib/prisma";
import { isReflectedInSchedule } from "@/lib/shift-swap";

/**
 * Marca los intercambios aprobados que el Drive ya refleja.
 *
 * La app no escribe el horario (el archivo sigue mandando), así que tras aprobar
 * un cambio queda un pendiente: gerencia debe editarlo en el Drive. Esto detecta
 * SOLO cuándo ya quedó — nadie tiene que acordarse de marcarlo como hecho, y el
 * recordatorio desaparece por sí mismo.
 *
 * Se exige que el intercambio esté COMPLETO en el horario (los dos, en los dos
 * días). Un cambio a medias no cuenta: es justo el error que provocó el bug del
 * ranking, con los dos apareciendo como laborando el mismo día.
 */
export async function reconcileShiftSwaps(storeId: string): Promise<number> {
  const pending = await prisma.shiftSwap.findMany({
    where: { storeId, status: "APROBADO", driveUpdated: false },
    select: { id: true, requesterId: true, requesterDate: true, targetId: true, targetDate: true }
  });
  if (pending.length === 0) return 0;

  const userIds = Array.from(new Set(pending.flatMap((swap) => [swap.requesterId, swap.targetId])));
  const dateKeys = Array.from(new Set(pending.flatMap((swap) => [swap.requesterDate, swap.targetDate])));
  const dates = dateKeys.map((key) => new Date(`${key}T00:00:00.000Z`));

  const schedules = await prisma.schedule.findMany({
    where: { storeId, userId: { in: userIds }, date: { in: dates } },
    select: { userId: true, date: true, status: true }
  });
  const byKey = new Map(
    schedules.map((row) => [`${row.userId}:${row.date.toISOString().slice(0, 10)}`, row.status as string])
  );
  const scheduleOf = (userId: string, date: string) => byKey.get(`${userId}:${date}`) ?? null;

  const done = pending.filter((swap) => isReflectedInSchedule(swap, scheduleOf));
  if (done.length === 0) return 0;

  await prisma.shiftSwap.updateMany({
    where: { id: { in: done.map((swap) => swap.id) } },
    data: { driveUpdated: true }
  });
  return done.length;
}
