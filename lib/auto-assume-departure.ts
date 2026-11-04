/**
 * Auto-asunción de SALIDA a las 10:00 PM.
 *
 * Regla de la tienda: si a las 22:00 alguien tiene registro de entrada pero
 * no marcó salida, se asume que salió a su hora esperada (Schedule.endTime
 * o 21:00 por defecto).
 *
 * - Solo toca registros que YA tienen entrada (arrivedAt != null).
 * - No pisa salidas ya capturadas (leftAt != null).
 * - Actualiza minutesBalance con el tiempo completo trabajado.
 * - Marca con note adicional para distinguir en reportes.
 */

import { DEFAULT_EXIT } from "@/lib/hours-balance";
import { dayBalanceMinutes } from "@/lib/hours-balance";
import { todayInMonterrey } from "@/lib/mexico-timezone";
import { prisma } from "@/lib/prisma";

export interface AutoAssumeDepartureResult {
  storeId: string;
  updated: number;
  alreadyHadDeparture: number;
  noEntry: number;
  errors: string[];
}

/**
 * Para una tienda y una fecha, asume salida de quien no la marcó.
 */
export async function autoAssumeDeparture(
  storeId: string,
  targetDate?: Date
): Promise<AutoAssumeDepartureResult> {
  const date = targetDate ?? todayInMonterrey();

  const result: AutoAssumeDepartureResult = {
    storeId,
    updated: 0,
    alreadyHadDeparture: 0,
    noEntry: 0,
    errors: []
  };

  // 1. Buscar asistencias de hoy que tengan entrada pero no salida
  const attendances = await prisma.attendance.findMany({
    where: {
      storeId,
      date,
      arrivedAt: { not: null },
      leftAt: null
    },
    select: {
      id: true,
      userId: true,
      expectedAt: true,
      expectedLeaveAt: true,
      arrivedAt: true,
      leftAt: true,
      status: true,
      minutesLate: true,
      minutesBalance: true,
      note: true
    }
  });

  if (attendances.length === 0) return result;

  // 2. Para cada una, asumir la salida esperada
  for (const att of attendances) {
    if (att.leftAt !== null) {
      result.alreadyHadDeparture += 1;
      continue;
    }

    if (att.arrivedAt === null) {
      result.noEntry += 1;
      continue;
    }

    const expectedLeave = att.expectedLeaveAt ?? DEFAULT_EXIT;

    // Recalcular el balance de minutos con la salida asumida
    const minutesBalance = dayBalanceMinutes({
      status: att.status,
      expectedEntry: att.expectedAt,
      arrivedAt: att.arrivedAt,
      leftAt: expectedLeave,
      expectedExit: expectedLeave
    });

    try {
      await prisma.attendance.update({
        where: { id: att.id },
        data: {
          leftAt: expectedLeave,
          minutesBalance,
          note: att.note
            ? `${att.note} | Salida asumida automáticamente a las 10:00 PM`
            : "Salida asumida automáticamente a las 10:00 PM por falta de captura"
        }
      });
      result.updated += 1;
    } catch (error) {
      result.errors.push(
        `attendanceId=${att.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Corre la asunción de salida para TODAS las tiendas.
 * Pensado para el cron de las 22:00.
 */
export async function autoAssumeDepartureAllStores(): Promise<AutoAssumeDepartureResult[]> {
  const stores = await prisma.store.findMany({
    select: { id: true }
  });

  const results: AutoAssumeDepartureResult[] = [];
  for (const store of stores) {
    results.push(await autoAssumeDeparture(store.id));
  }
  return results;
}
