/**
 * Utilidades para trabajar con la zona horaria de Monterrey, México.
 *
 * El servidor está en UTC, pero las reglas de negocio (a qué hora marca
 * entrada/salida alguien) dependen del día EN MONTERREY, no del día UTC.
 */

/**
 * Devuelve la fecha actual en Monterrey como un Date normalizado a medianoche
 * UTC del día correspondiente.
 *
 * Ejemplo: si en Monterrey son las 22:30 del 4 nov (y en UTC son las 04:30 del 5 nov),
 * devuelve Date.UTC(2026, 10, 4) → el 4 de noviembre a medianoche UTC.
 *
 * Esto permite que `Attendance.date` (que es @db.Date y se guarda a medianoche UTC)
 * coincida con el día de Monterrey, no con el día del servidor.
 */
export function todayInMonterrey(): Date {
  const now = new Date();

  // Convertir a la zona de Monterrey usando Intl
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === "year")!.value);
  const month = parseInt(parts.find(p => p.type === "month")!.value) - 1; // 0-indexed
  const day = parseInt(parts.find(p => p.type === "day")!.value);

  // Devolver medianoche UTC de ese día
  return new Date(Date.UTC(year, month, day));
}
