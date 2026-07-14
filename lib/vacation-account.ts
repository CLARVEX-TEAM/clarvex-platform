import { prisma } from "@/lib/prisma";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { splitVacationDays, vacationEarnedBetween } from "@/lib/vacations";

/**
 * Saldo REAL de vacaciones de una persona.
 *
 *   saldo = saldo inicial (User.vacationDays, el que gerencia capturó)
 *         + días ganados en los aniversarios posteriores a esa captura
 *         − días de vacaciones que YA SE TOMARON desde entonces
 *
 * Por qué existe: `User.vacationDays` es un número a mano. Sin esto, hay que
 * acordarse de bajarlo cada vez que alguien se va de vacaciones y de subirlo cada
 * aniversario. Nadie se acuerda: el número se desfasa y termina alimentando a
 * nómina un dato que ya no es cierto.
 *
 * `vacationBaselineAt` es la FECHA DE CORTE: el saldo capturado ya descuenta todo
 * lo anterior a ella. Solo se cuenta lo que pasó DESPUÉS. Sin esa frontera se
 * restarían dos veces las vacaciones viejas.
 *
 * Los días FUTUROS no se descuentan (ver `splitVacationDays`).
 *
 * Este es el número que manda: para mostrar y para validar una solicitud.
 */

export type VacationBalance = {
  /** Saldo capturado a mano y su fecha de corte. */
  baseline: number;
  baselineAt: Date | null;
  /** Ganados en aniversarios posteriores al corte. */
  earned: number;
  /** Tomados después del corte. Solo días que YA pasaron. */
  taken: number;
  /** Ya capturados en Horarios pero todavía por venir. NO se descuentan aún. */
  planned: number;
  /** Lo que de verdad le queda hoy. */
  available: number;
};

/** Saldo de vacaciones de varias personas de golpe. */
export async function vacationBalances(userIds: string[], now = new Date()): Promise<Map<string, VacationBalance>> {
  if (userIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, vacationDays: true, hireDate: true, vacationBaselineAt: true }
  });

  // Sin fecha de corte no se puede saber qué ya estaba descontado: se cuenta desde
  // ahora, o sea que el saldo capturado se respeta tal cual. Es lo prudente: más
  // vale un saldo que no se mueve que uno que resta de más.
  const earliest = users.reduce<Date>((oldest, user) => {
    const at = user.vacationBaselineAt ?? now;
    return at.getTime() < oldest.getTime() ? at : oldest;
  }, now);

  // Hoy en Monterrey, no en UTC: el VPS corre en UTC y de noche allá ya es el día
  // siguiente. Sin esto, un día de vacaciones se descontaría antes de terminar.
  const today = resolveMonterreyDate(now).utcDate;

  const [attendance, schedules] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: { in: userIds }, status: "VACATION", date: { gt: earliest } },
      select: { userId: true, date: true }
    }),
    prisma.schedule.findMany({
      where: { userId: { in: userIds }, status: "VACATION", date: { gt: earliest } },
      select: { userId: true, date: true }
    })
  ]);
  const days = splitVacationDays([...attendance, ...schedules], earliest, today);

  return new Map(users.map((user) => {
    const baselineAt = user.vacationBaselineAt;
    const baseline = user.vacationDays;

    // Sin fecha de ingreso no se puede calcular la antigüedad: no se inventa
    // derecho, se deja el saldo capturado. La pantalla avisa que falta el dato.
    const earned = user.hireDate && baselineAt
      ? vacationEarnedBetween(user.hireDate, baselineAt, now)
      : 0;

    const counted = baselineAt ? days.get(user.id) : undefined;
    const taken = counted?.taken ?? 0;

    return [user.id, {
      baseline,
      baselineAt,
      earned,
      taken,
      planned: days.get(user.id)?.planned ?? 0,
      available: baseline + earned - taken
    }];
  }));
}

/** Días disponibles de una persona. Es el número que se muestra y con el que se valida. */
export async function vacationDaysAvailable(userId: string, now = new Date()): Promise<number> {
  const balances = await vacationBalances([userId], now);
  return balances.get(userId)?.available ?? 0;
}
