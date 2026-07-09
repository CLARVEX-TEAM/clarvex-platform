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
    // For cross-calendar-month weeks determine the retail month by weekStart position:
    // - weekStart on day 29-31 → the week OPENS a new retail month (use weekEnd's month)
    // - weekStart on day 1-28 crossing into next month → the week CLOSES the current retail
    //   month (last few days spill over, e.g. Jun 28 – Jul 4 belongs to June retail)
    let year: number;
    let month: number;
    if (week.weekStart.getUTCMonth() !== week.weekEnd.getUTCMonth() && week.weekStart.getUTCDate() < 29) {
      year = week.weekStart.getUTCFullYear();
      month = week.weekStart.getUTCMonth();
    } else {
      year = week.weekEnd.getUTCFullYear();
      month = week.weekEnd.getUTCMonth();
    }
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const existing = months.get(key);
    months.set(key, {
      label: new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).replace(" de ", " ").replace(/^./, (letter) => letter.toUpperCase()),
      start: existing && existing.start < week.weekStart ? existing.start : week.weekStart,
      end: existing && existing.end > week.weekEnd ? existing.end : week.weekEnd
    });
  }
  return Array.from(months.values()).sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function periodDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function selectRetailMonth(months: Array<{ label: string; start: Date; end: Date }>, selectedDate: Date) {
  return months.find((month) => selectedDate >= month.start && selectedDate <= month.end)
    ?? months.find((month) => month.end.getUTCFullYear() === selectedDate.getUTCFullYear() && month.end.getUTCMonth() === selectedDate.getUTCMonth())
    ?? months.at(-1)
    ?? null;
}

export function selectRdvWeek(weeks: Array<{ weekNumber: number; weekStart: Date; weekEnd: Date }>, selectedDate: Date) {
  return weeks.find((week) => week.weekStart.getTime() === selectedDate.getTime())
    ?? weeks.find((week) => selectedDate >= week.weekStart && selectedDate <= week.weekEnd)
    ?? null;
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

