// Resolución de la fecha "de hoy" en zona America/Monterrey para los crons.
// Devuelve la fecha como string YYYY-MM-DD, su Date UTC medianoche (formato KPI),
// una etiqueta legible y el día de la semana (0=domingo ... 6=sábado).

export type MonterreyDate = {
  dateKey: string;
  utcDate: Date;
  dateLabel: string;
  weekday: number;
};

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
