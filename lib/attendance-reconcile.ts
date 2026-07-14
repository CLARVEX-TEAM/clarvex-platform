import { prisma } from "@/lib/prisma";
import type { AttendanceStatus } from "@/lib/attendance";

/**
 * Corrige faltas que dejaron de serlo porque el HORARIO cambió después.
 *
 * El caso real: se le concede el descanso a alguien, pero no se alcanza a
 * actualizar el archivo de Horarios ese mismo día. El archivo sigue diciendo
 * LABORANDO, la persona no viene (tiene permiso), y el cron de asistencia la
 * marca FALTA. Luego se corrige el Drive… pero la falta ya quedó grabada, y de
 * ahí se va a nómina.
 *
 * Por eso, cada vez que se sincronizan los Horarios, se revisan los días que
 * cambiaron y se arreglan esas faltas.
 *
 * ⚠️ Solo se tocan días donde NADIE marcó entrada (`arrivedAt` nulo). Si la
 * persona sí llegó y el POS lo registró, ese hecho no se borra por cambiar un
 * horario a posteriori: trabajó, y se le debe.
 *
 * Tampoco se pisan las correcciones MANUALES de gerencia.
 */

const SCHEDULE_TO_ATTENDANCE: Record<string, AttendanceStatus> = {
  OFF: "REST",
  VACATION: "VACATION",
  PAID_DAY: "PAID_DAY",
  INVENTORY: "INVENTORY",
  TERMINATED: "REST"
};

/** Devuelve cuántas faltas se corrigieron. */
export async function reconcileAbsences(storeId: string, dates: Date[]): Promise<number> {
  if (dates.length === 0) return 0;

  // Faltas registradas por el archivo, sin hora de llegada: candidatas a estar mal.
  const suspects = await prisma.attendance.findMany({
    where: {
      storeId,
      date: { in: dates },
      status: "ABSENT",
      arrivedAt: null,
      source: { not: "MANUAL" }
    },
    select: { id: true, userId: true, date: true }
  });
  if (suspects.length === 0) return 0;

  // ¿Qué dice AHORA el horario de esos días?
  const schedules = await prisma.schedule.findMany({
    where: { storeId, userId: { in: suspects.map((row) => row.userId) }, date: { in: dates } },
    select: { userId: true, date: true, status: true }
  });
  const scheduleByKey = new Map(
    schedules.map((row) => [`${row.userId}:${row.date.toISOString()}`, row.status])
  );

  let fixed = 0;
  for (const suspect of suspects) {
    const scheduled = scheduleByKey.get(`${suspect.userId}:${suspect.date.toISOString()}`);
    // Si el horario dice que ya NO le tocaba trabajar, no fue falta.
    const corrected = scheduled ? SCHEDULE_TO_ATTENDANCE[scheduled] : undefined;
    if (!corrected) continue;

    await prisma.attendance.update({
      where: { id: suspect.id },
      data: {
        status: corrected,
        minutesLate: 0,
        minutesBalance: 0, // un día que no le tocaba no mueve el banco de horas
        note: "Corregida automáticamente: el horario cambió a no laborable."
      }
    });
    fixed += 1;
  }
  return fixed;
}
