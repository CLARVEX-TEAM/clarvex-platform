import { reconcileAbsences } from "@/lib/attendance-reconcile";
import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import { prisma } from "@/lib/prisma";
import {
  normalizeScheduleEntry,
  type NormalizedScheduleEntry,
  type ScheduleCaptureEntry
} from "@/lib/schedule-capture-entry";
import { scheduleScopeDates } from "@/lib/schedule-sync-diff";
import { reconcileShiftSwaps } from "@/lib/shift-swap-reconcile";

/**
 * Captura manual de horarios, la vía que sustituye al Excel de Axo.
 *
 * Escribe exactamente los mismos campos que `importSchedules` para que una
 * semana capturada a mano y una importada sean indistinguibles aguas abajo.
 * La validación de cada fila vive en `lib/schedule-capture-entry`.
 *
 * ⚠️ UNA diferencia deliberada con el importador: aquí NO se borran turnos.
 * El importador puede hacerlo porque el archivo es una foto completa de la
 * semana, así que lo que falta es que se quitó. Una captura es una edición
 * PARCIAL —normalmente unas pocas celdas—, y borrar lo que no venga en el
 * cuerpo vaciaría la semana entera al guardar un solo cambio.
 */

export type ScheduleCaptureResult = {
  recordsCreated: number;
  recordsUpdated: number;
  employeesNotFound: string[];
  absencesFixed: number;
  swapsReconciled: number;
  errors: string[];
};

/**
 * Guarda una tanda de horarios capturados a mano. Valida TODO antes de escribir
 * nada: una tanda con una fila mala no deja la semana a medias.
 */
export async function captureSchedules(
  storeId: string,
  entries: ScheduleCaptureEntry[]
): Promise<{ ok: false; errors: string[] } | { ok: true; result: ScheduleCaptureResult }> {
  const normalized: NormalizedScheduleEntry[] = [];
  const errors: string[] = [];
  for (const entry of entries) {
    const outcome = normalizeScheduleEntry(entry);
    if (outcome.ok) normalized.push(outcome.value);
    else errors.push(outcome.error);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Una misma celda enviada dos veces en el mismo cuerpo: gana la última, que es
  // lo que vería quien edita. Sin esto el segundo upsert cuenta como "creado".
  const deduped = Array.from(
    new Map(normalized.map((item) => [`${item.employeeNumber}:${item.date.toISOString()}`, item])).values()
  );

  const employeeNumbers = Array.from(new Set(deduped.map((item) => item.employeeNumber)));
  const users = employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: {
          storeId,
          OR: [
            { employeeNumber: { in: employeeNumbers } },
            { employeeNumberAliases: { some: { employeeNumber: { in: employeeNumbers } } } }
          ]
        },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  const employeesNotFound = employeeNumbers.filter((number) => !userByEmployee.has(number));

  const matched = deduped.flatMap((item) => {
    const userId = userByEmployee.get(item.employeeNumber);
    return userId ? [{ ...item, userId }] : [];
  });

  const existing = matched.length > 0
    ? await prisma.schedule.findMany({
        where: {
          storeId,
          userId: { in: Array.from(new Set(matched.map((item) => item.userId))) },
          date: { in: Array.from(new Map(matched.map((item) => [item.date.toISOString(), item.date])).values()) }
        },
        select: { userId: true, date: true }
      })
    : [];
  const existingKeys = new Set(existing.map((row) => `${row.userId}:${row.date.toISOString()}`));

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const writeErrors: string[] = [];

  for (const item of matched) {
    const data = {
      storeId,
      day: item.day,
      status: item.status,
      statusRaw: item.statusRaw,
      startTime: item.startTime,
      endTime: item.endTime,
      weekStart: item.weekStart
    };
    try {
      await prisma.schedule.upsert({
        where: { userId_date: { userId: item.userId, date: item.date } },
        update: data,
        create: { ...data, userId: item.userId, date: item.date }
      });
      if (existingKeys.has(`${item.userId}:${item.date.toISOString()}`)) recordsUpdated += 1;
      else recordsCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      writeErrors.push(`Empleado ${item.employeeNumber}, fecha ${item.date.toISOString().slice(0, 10)}: ${message}`);
    }
  }

  // Mismas reconciliaciones que hace la sincronización. Sin esto, conceder un
  // descanso dejaría en pie la FALTA que el cron ya había registrado ese día.
  const absencesFixed = matched.length > 0 ? await reconcileAbsences(storeId, scheduleScopeDates(matched)) : 0;
  const swapsReconciled = matched.length > 0 ? await reconcileShiftSwaps(storeId) : 0;

  return {
    ok: true,
    result: { recordsCreated, recordsUpdated, employeesNotFound, absencesFixed, swapsReconciled, errors: writeErrors }
  };
}
