import { prisma } from "@/lib/prisma";

/**
 * Saldo REAL de horas de una persona.
 *
 *   saldo = saldo inicial (User.hoursOwed, el que venía del Excel)
 *         + todo lo que la app ha registrado (suma de Attendance.minutesBalance)
 *
 * Por qué existe: `User.hoursOwed` es un número que gerencia captura a mano. La
 * app, además, acumula horas sola (entrar temprano suma, salir temprano resta).
 * Si el saldo se leyera solo de `hoursOwed`, las horas ganadas automáticamente
 * quedarían ATRAPADAS: el asesor las tendría, pero al pedir salir temprano la
 * pantalla le diría que no tiene saldo.
 *
 * Este es el número que manda: para mostrar y para validar una solicitud.
 */

/** Saldo en MINUTOS de varios usuarios de golpe. */
export async function hoursBalanceMinutes(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const [users, earned] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, hoursOwed: true } }),
    prisma.attendance.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { minutesBalance: true }
    })
  ]);

  const earnedByUser = new Map(earned.map((row) => [row.userId, row._sum.minutesBalance ?? 0]));
  return new Map(users.map((user) => [
    user.id,
    Math.round(user.hoursOwed * 60) + (earnedByUser.get(user.id) ?? 0)
  ]));
}

/** Saldo de una persona, en HORAS (con dos decimales). Es como se pide y se muestra. */
export async function hoursBalanceFor(userId: string): Promise<number> {
  const balances = await hoursBalanceMinutes([userId]);
  const minutes = balances.get(userId) ?? 0;
  return Math.round((minutes / 60) * 100) / 100;
}
