/**
 * Lógica pura del "diff" de sincronización: qué registros guardados ya no existen
 * en el archivo y hay que borrar.
 *
 * Lo comparten Horarios y KPIs porque los dos tienen el mismo problema: el parser
 * NO emite registro cuando la celda está vacía, y el import solo hace upsert
 * (crea/actualiza). Así que al reasignar algo —se vacía la celda de una persona y
 * se llena la de otra— el registro viejo sobrevivía en la BD:
 *  - Horarios: aparecían las dos personas laborando el mismo día.
 *  - KPIs: la meta vieja seguía sumándose al total de tienda.
 *
 * Vive fuera de data-source-sync.ts (que importa prisma) para poder probarse sin
 * base de datos.
 */

type Keyed = { userId: string; date: Date };

function key(userId: string, date: Date) {
  return `${userId}:${date.toISOString()}`;
}

/**
 * Devuelve los ids de los registros guardados que el archivo ya no respalda.
 *
 * `existing` debe venir acotado a los empleados y fechas que SÍ aparecen en el
 * archivo: nunca se evalúan otras semanas ni personas fuera de la hoja.
 */
export function findStaleRecordIds<T extends Keyed & { id: string }>(
  existing: T[],
  fromFile: Keyed[]
): string[] {
  const keep = new Set(fromFile.map((record) => key(record.userId, record.date)));
  return existing.filter((record) => !keep.has(key(record.userId, record.date))).map((record) => record.id);
}

/** Fechas únicas presentes en el archivo: define hasta dónde puede borrar el sync. */
export function syncScopeDates(fromFile: Keyed[]): Date[] {
  return Array.from(new Map(fromFile.map((record) => [record.date.toISOString(), record.date])).values());
}

// Alias por compatibilidad: el sync de horarios ya usaba estos nombres.
export const findStaleScheduleIds = findStaleRecordIds;
export const scheduleScopeDates = syncScopeDates;
