export type KpiPeriod = "week" | "month";

export function parsePeriodDate(value: string | null, fallback = new Date()) {
  if (!value) return utcDate(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date : null;
}

export function getKpiPeriodRange(period: KpiPeriod, selectedDate: Date) {
  if (period === "month") {
    const start = utcDate(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1);
    const end = utcDate(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + 1, 0);
    return { start, end };
  }

  const start = new Date(selectedDate);
  const isoDay = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - isoDay + 1);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end };
}

export function periodDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function isoWeekNumber(date: Date) {
  const target = new Date(date);
  const isoDay = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - isoDay);
  const yearStart = utcDate(target.getUTCFullYear(), 0, 1);
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}
