/**
 * Lógica pura del "diff" de horarios: qué turnos guardados ya no existen en el
 * archivo y hay que borrar.
 *
 * Vive fuera de data-source-sync.ts (que importa prisma) para poder probarse sin
 * base de datos.
 *
 * El problema que resuelve: el parser NO emite registro cuando la celda está
 * vacía, y el import solo hace upsert (crea/actualiza). Así que al reasignar un
 * turno —se vacía la celda de una persona y se llena la de otra— el turno viejo
 * sobrevivía en la BD y aparecían las dos laborando el mismo día.
 */

type ScheduleKeyed = { userId: string; date: Date };

function key(userId: string, date: Date) {
  return `${userId}:${date.toISOString()}`;
}

/**
 * Devuelve los ids de los turnos guardados que el archivo ya no respalda.
 *
 * `existing` debe venir acotado a los empleados y fechas que SÍ aparecen en el
 * archivo: nunca se evalúan otras semanas ni personas fuera de la hoja.
 */
export function findStaleScheduleIds<T extends ScheduleKeyed & { id: string }>(
  existing: T[],
  fromFile: ScheduleKeyed[]
): string[] {
  const keep = new Set(fromFile.map((record) => key(record.userId, record.date)));
  return existing.filter((schedule) => !keep.has(key(schedule.userId, schedule.date))).map((schedule) => schedule.id);
}

/** Fechas únicas presentes en el archivo: define hasta dónde puede borrar el sync. */
export function scheduleScopeDates(fromFile: ScheduleKeyed[]): Date[] {
  return Array.from(new Map(fromFile.map((record) => [record.date.toISOString(), record.date])).values());
}
