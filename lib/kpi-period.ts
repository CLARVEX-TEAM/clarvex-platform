export type KpiPeriod = "week" | "month";
export type RetailMonth = { label: string; start: Date; end: Date };

export function parsePeriodDate(value: string | null, fallback = new Date()) {
  if (!value) return utcDate(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? date : null;
}

export function buildRetailMonths(weeks: Array<{ weekStart: Date; weekEnd: Date }>): RetailMonth[] {
  const months = new Map<string, RetailMonth>();
  for (const week of weeks) {
    const year = week.weekEnd.getUTCFullYear();
    const month = week.weekEnd.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const existing = months.get(key);
    months.set(key, {
      label: new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).replace(" de ", " ").replace(/^./, (letter) => letter.toUpperCase()),
      start: existing && existing.start < week.weekStart ? existing.start : week.weekStart,
      end: utcDate(year, month + 1, 0)
    });
  }
  return Array.from(months.values()).sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function periodDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}
