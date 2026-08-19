import { paidDaysEarned, weekOf } from "@/lib/paid-days";
import { prisma } from "@/lib/prisma";
import { resolveMonterreyDate } from "@/lib/cron-time";

/**
 * Saldo REAL de pago de días de una persona.
 *
 *   saldo = saldo capturado a mano (User.paidDays)
 *         + días ganados en las semanas posteriores al corte
 *         − días de pago que YA SE TOMARON desde entonces
 *
 * Se gana un día cada vez que una semana se descansa de menos: en tienda se
 * descansan dos días, y la semana que solo se descansa uno la tienda lo queda a
 * deber. Ver `lib/paid-days` para la regla y sus casos raros.
 *
 * Por qué existe: `User.paidDays` era un número a mano, con el mismo problema
 * que tenían las vacaciones y las horas. Nadie se acuerda de subirlo cada
 * semana, así que el saldo se desfasa en silencio hasta que alguien reclama —y
 * cuando reclama, ya nadie sabe reconstruirlo.
 *
 * `paidDaysBaselineAt` es la FECHA DE CORTE: el saldo capturado ya cubre todo lo
 * anterior a ella, así que solo se cuentan las semanas posteriores. Sin esa
 * frontera se sumarían dos veces las semanas viejas.
 *
 * Los días de pago FUTUROS, ya puestos en el horario pero que aún no llegan, no
 * se descuentan todavía: se informan aparte para que se vean venir.
 */

export type PaidDaysBalance = {
  /** Saldo capturado a mano y su fecha de corte. */
  baseline: number;
  baselineAt: Date | null;
  /** Ganados en semanas completas posteriores al corte. */
  earned: number;
  /** Tomados después del corte. Solo días que YA pasaron. */
  taken: number;
  /** Ya capturados en Horarios pero todavía por venir. NO se descuentan aún. */
  planned: number;
  /** Lo que de verdad le queda hoy. */
  available: number;
};

export async function paidDaysBalances(userIds: string[], now = new Date()): Promise<Map<string, PaidDaysBalance>> {
  if (userIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, paidDays: true, paidDaysBaselineAt: true }
  });

  // Sin fecha de corte no se sabe qué ya estaba contado: no se cuenta nada y el
  // saldo capturado se respeta tal cual. Es lo prudente — más vale un saldo que
  // no se mueve que uno que suma de más.
  const earliest = users.reduce<Date>((oldest, user) => {
    const at = user.paidDaysBaselineAt ?? now;
    return at.getTime() < oldest.getTime() ? at : oldest;
  }, now);

  // Hoy en Monterrey, no en UTC: el VPS corre en UTC y de noche allá ya es el
  // día siguiente. Sin esto, un día de pago se descontaría antes de ocurrir.
  const today = resolveMonterreyDate(now).utcDate;

  const [schedules, taken] = await Promise.all([
    prisma.schedule.findMany({
      where: { userId: { in: userIds }, date: { gte: earliest } },
      select: { userId: true, date: true, status: true }
    }),
    prisma.schedule.findMany({
      where: { userId: { in: userIds }, status: "PAID_DAY", date: { gte: earliest } },
      select: { userId: true, date: true }
    })
  ]);

  const daysByUser = new Map<string, { week: string; status: string }[]>();
  for (const row of schedules) {
    const bucket = daysByUser.get(row.userId) ?? [];
    bucket.push({ week: weekOf(row.date), status: row.status });
    daysByUser.set(row.userId, bucket);
  }

  const takenByUser = new Map<string, { taken: number; planned: number }>();
  for (const row of taken) {
    const bucket = takenByUser.get(row.userId) ?? { taken: 0, planned: 0 };
    if (row.date.getTime() <= today.getTime()) bucket.taken += 1;
    else bucket.planned += 1;
    takenByUser.set(row.userId, bucket);
  }

  return new Map(users.map((user) => {
    const baselineAt = user.paidDaysBaselineAt;
    const baseline = user.paidDays;
    // Sin corte no se cuenta nada: el saldo capturado manda.
    const earned = baselineAt ? paidDaysEarned(daysByUser.get(user.id) ?? [], today) : 0;
    const counted = baselineAt ? takenByUser.get(user.id) : undefined;

    return [user.id, {
      baseline,
      baselineAt,
      earned,
      taken: counted?.taken ?? 0,
      planned: counted?.planned ?? 0,
      available: baseline + earned - (counted?.taken ?? 0)
    }];
  }));
}

/** Días de pago disponibles hoy para una persona. Es el número que manda. */
export async function paidDaysAvailable(userId: string): Promise<number> {
  const balances = await paidDaysBalances([userId]);
  return balances.get(userId)?.available ?? 0;
}
