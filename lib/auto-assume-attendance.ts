/**
 * Auto-asunción de asistencia a la 1:00 PM.
 *
 * Regla de la tienda: si a la 13:00 no se capturó nada de alguien en Retool,
 * se asume que llegó a tiempo y se le crea el registro automáticamente.
 *
 * - Respeta el horario especial (Buen Fin, diciembre) si existe en Schedule.
 * - Toca solamente a quien tenía turno de trabajo ese día.
 * - No pisa registros ya capturados (MANUAL, IMPORT, etc.).
 * - Marca con source = "AUTO_ASSUMED" para distinguirlos en reportes.
 */

import {
  classifyDay,
  expectedEntry,
  type AttendanceStatus,
  type ScheduledStatus
} from "@/lib/attendance";
import { dayBalanceMinutes, DEFAULT_EXIT } from "@/lib/hours-balance";
import { prisma } from "@/lib/prisma";

const SOURCE = "AUTO_ASSUMED";

export interface AutoAssumeResult {
  storeId: string;
  created: number;
  alreadyExisted: number;
  withoutSchedule: number;
  errors: string[];
}

/**
 * Para una tienda y una fecha, asume entrada a tiempo de quien no tiene
 * registro. Devuelve cuántos creó y a cuántos saltó.
 */
export async function autoAssumeAttendance(
  storeId: string,
  targetDate?: Date
): Promise<AutoAssumeResult> {
  const date = targetDate ?? new Date();
  // Normalizar a medianoche UTC para que el upsert sea por día
  const dateKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  const result: AutoAssumeResult = {
    storeId,
    created: 0,
    alreadyExisted: 0,
    withoutSchedule: 0,
    errors: []
  };

  // 1. Traer a quien le tocaba trabajar hoy (Schedule activo)
  const schedules = await prisma.schedule.findMany({
    where: {
      storeId,
      date: dateKey,
      status: { in: ["WORKING"] as ScheduledStatus[] }
    },
    select: {
      userId: true,
      startTime: true,
      endTime: true
    }
  });

  if (schedules.length === 0) return result;

  const userIds = schedules.map((s) => s.userId);

  // 2. Ver quién ya tiene registro de asistencia hoy (cualquier fuente)
  const existing = await prisma.attendance.findMany({
    where: {
      storeId,
      date: dateKey,
      userId: { in: userIds }
    },
    select: { userId: true }
  });
  const existingSet = new Set(existing.map((e) => e.userId));

  // 3. Para cada programado sin registro, crear el asumido
  for (const schedule of schedules) {
    if (existingSet.has(schedule.userId)) {
      result.alreadyExisted += 1;
      continue;
    }

    const expected = schedule.startTime ?? expectedEntry(schedule.startTime);
    const expectedLeave = schedule.endTime ?? DEFAULT_EXIT;
    const arrivedText = expected; // asumimos que llegó a su hora esperada

    const classified = classifyDay({
      expected,
      arrived: arrivedText,
      scheduled: "WORKING",
      entryText: null
    });

    // Solo asumimos si la clasificación da ON_TIME (si el horario fuera
    // distinto y classifyDay diera otra cosa, respetamos eso y no creamos).
    if (classified.status !== "ON_TIME") {
      result.withoutSchedule += 1;
      continue;
    }

    const minutesBalance = dayBalanceMinutes({
      status: classified.status,
      expectedEntry: expected,
      arrivedAt: arrivedText,
      leftAt: null,
      expectedExit: expectedLeave
    });

    try {
      await prisma.attendance.upsert({
        where: { userId_date: { userId: schedule.userId, date: dateKey } },
        create: {
          storeId,
          userId: schedule.userId,
          date: dateKey,
          expectedAt: expected,
          expectedLeaveAt: expectedLeave,
          arrivedAt: arrivedText,
          lunchStart: null,
          leftAt: null,
          minutesLate: classified.minutesLate,
          minutesBalance,
          status: classified.status,
          entryText: null,
          note: "Entrada asumida automáticamente a la 1:00 PM por falta de captura",
          source: SOURCE
        },
        update: {} // no pisamos si ya existe
      });
      result.created += 1;
    } catch (error) {
      result.errors.push(
        `userId=${schedule.userId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Corre la asunción para TODAS las tiendas que tienen Schedules hoy.
 * Pensado para el cron de las 13:00.
 */
export async function autoAssumeAttendanceAllStores(): Promise<AutoAssumeResult[]> {
  const stores = await prisma.store.findMany({
    select: { id: true }
  });

  const results: AutoAssumeResult[] = [];
  for (const store of stores) {
    results.push(await autoAssumeAttendance(store.id));
  }
  return results;
}
