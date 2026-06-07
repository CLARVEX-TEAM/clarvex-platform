export type KpiPeriod = "week" | "month";

export function parsePeriodDate(value: string | null, fallback = new Date()) {
  if (!value) return utcDate(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date : null;
}

export function getKpiMonthRange(selectedDate: Date) {
  const start = utcDate(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1);
  const end = utcDate(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0);
  return { start, end };
}

export function periodDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}
