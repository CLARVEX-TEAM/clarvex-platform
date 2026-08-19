import { prisma } from "@/lib/prisma";

/**
 * Saldo REAL de horas de una persona.
 *
 *   saldo = ajuste de gerencia (User.hoursOwed)
 *         + todo lo que la app ha registrado DESPUÉS del corte
 *
 * Por qué existe: la app acumula horas sola —entrar temprano suma, salir
 * temprano resta—, pero hay movimientos que no puede saber por su cuenta. El
 * principal es **pagar horas**: cuando a alguien se le liquida su saldo, esas
 * horas tienen que salir de algún lado, y no hay ningún día que las descuente.
 * `hoursOwed` es esa palanca.
 *
 * ⚠️ Nació como el saldo heredado del Excel (18 de agosto de 2026: se dejó de
 * usar para eso). Hoy es el **ajuste manual de gerencia** y no debe tocarse
 * salvo para liquidar horas o corregir algo que la app no puede deducir. Sin
 * él, el acumulado solo sabría crecer.
 *
 * `hoursBaselineAt` es la FECHA DE CORTE: el ajuste ya cubre todo lo anterior a
 * ella, así que solo se suma lo posterior. Sin esa frontera, ajustar el saldo a
 * mano volvía a sumarle encima todo el histórico, y el número quedaba mal justo
 * después de corregirlo.
 *
 * Este es el número que manda: para mostrar y para validar una solicitud.
 */

export type HoursBalance = {
  /** Ajuste de gerencia, en minutos, y desde cuándo cuenta la app. */
  adjustment: number;
  baselineAt: Date | null;
  /** Ganadas por la app desde el corte (entrar temprano, trabajar el descanso). */
  earned: number;
  /** Descontadas desde el corte (salir temprano, entrada tarde). En positivo. */
  spent: number;
  /** Lo que de verdad tiene hoy. */
  balance: number;
};

/** Saldo desglosado de varias personas de golpe. */
export async function hoursBalances(userIds: string[]): Promise<Map<string, HoursBalance>> {
  if (userIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, hoursOwed: true, hoursBaselineAt: true }
  });

  // Sin fecha de corte se cuenta TODO, que es como funcionaba antes de que el
  // corte existiera. Así una tienda que aún no lo tiene no cambia de números.
  const days = await prisma.attendance.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, date: true, minutesBalance: true }
  });

  const baselineByUser = new Map(users.map((user) => [user.id, user.hoursBaselineAt]));
  const movement = new Map<string, { earned: number; spent: number }>();
  for (const day of days) {
    if (day.minutesBalance === 0) continue;
    const baseline = baselineByUser.get(day.userId);
    if (baseline && day.date.getTime() < baseline.getTime()) continue;
    const bucket = movement.get(day.userId) ?? { earned: 0, spent: 0 };
    if (day.minutesBalance > 0) bucket.earned += day.minutesBalance;
    else bucket.spent += -day.minutesBalance;
    movement.set(day.userId, bucket);
  }

  return new Map(users.map((user) => {
    const adjustment = Math.round(user.hoursOwed * 60);
    const counted = movement.get(user.id) ?? { earned: 0, spent: 0 };
    return [user.id, {
      adjustment,
      baselineAt: user.hoursBaselineAt,
      earned: counted.earned,
      spent: counted.spent,
      balance: adjustment + counted.earned - counted.spent
    }];
  }));
}

/** Saldo en MINUTOS de varios usuarios de golpe. */
export async function hoursBalanceMinutes(userIds: string[]): Promise<Map<string, number>> {
  const balances = await hoursBalances(userIds);
  return new Map(Array.from(balances.entries()).map(([userId, value]) => [userId, value.balance]));
}

/** Saldo de una persona, en HORAS (con dos decimales). Es como se pide y se muestra. */
export async function hoursBalanceFor(userId: string): Promise<number> {
  const balances = await hoursBalanceMinutes([userId]);
  const minutes = balances.get(userId) ?? 0;
  return Math.round((minutes / 60) * 100) / 100;
}
