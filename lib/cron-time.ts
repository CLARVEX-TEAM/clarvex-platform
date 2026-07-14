// Resolución de la fecha "de hoy" en zona America/Monterrey para los crons.
// Devuelve la fecha como string YYYY-MM-DD, su Date UTC medianoche (formato KPI),
// una etiqueta legible y el día de la semana (0=domingo ... 6=sábado).

export type MonterreyDate = {
  dateKey: string;
  utcDate: Date;
  dateLabel: string;
  weekday: number;
};

/**
 * Rango de la semana retail (domingo → sábado) que contiene la fecha dada.
 * Mismo criterio que la vista semanal de KPIs. Trabaja en UTC medianoche.
 */
export function retailWeekRange(utcDate: Date): { weekStart: Date; weekEnd: Date } {
  const weekday = utcDate.getUTCDay(); // 0=domingo ... 6=sábado
  const weekStart = new Date(utcDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return { weekStart, weekEnd };
}

/**
 * Minutos transcurridos del día EN MONTERREY (10:30 → 630).
 *
 * El VPS corre en UTC, y Monterrey es UTC−6. Usar `getUTCHours()` para compararlo
 * contra una hora local ("10:30") da un desfase de 6 horas: a las 6 de la mañana
 * la app creería que ya pasó la hora de corte y le pondría FALTA a todo el equipo
 * antes de que la tienda abra.
 */
export function monterreyMinutesOfDay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Monterrey",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const valueOf = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return valueOf("hour") * 60 + valueOf("minute");
}

export function resolveMonterreyDate(now = new Date()): MonterreyDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const valueOf = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = valueOf("year");
  const month = valueOf("month");
  const day = valueOf("day");
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dateLabel = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "long" }).format(utcDate);
  return { dateKey, utcDate, dateLabel, weekday: utcDate.getUTCDay() };
}
