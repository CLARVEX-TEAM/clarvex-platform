const DAY_MS = 24 * 60 * 60 * 1000;

export function parseWeekStart(value: string | null, fallback = new Date()) {
  if (!value) return startOfWeek(fallback);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) || date.getUTCDay() !== 0 ? null : date;
}

export function startOfWeek(date: Date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  utcDate.setUTCDate(utcDate.getUTCDate() - utcDate.getUTCDay());
  return utcDate;
}

export function endOfWeek(weekStart: Date) {
  return new Date(weekStart.getTime() + (6 * DAY_MS));
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: Date, amount: number) {
  return new Date(weekStart.getTime() + (amount * 7 * DAY_MS));
}
