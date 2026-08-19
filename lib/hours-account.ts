import { prisma } from "@/lib/prisma";

/**
 * Saldo REAL de horas de una persona.
 *
 *   saldo = ajuste de gerencia (User.hoursOwed)
 *         + todo lo que la app ha registrado (suma de Attendance.minutesBalance)
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
