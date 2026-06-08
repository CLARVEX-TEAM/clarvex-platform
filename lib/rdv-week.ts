const DAY_MS = 86_400_000;

export type RdvWeek = {
  weekNumber: number;
  weekStart: Date;
  weekEnd: Date;
};

export function reconstructRdvWeek(date: Date): RdvWeek {
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const weekEnd = new Date(weekStart.getTime() + (6 * DAY_MS));

  return {
    weekNumber: isoWeekNumber(weekStart),
    weekStart,
    weekEnd
  };
}

export function mergeRdvWeeks(primary: RdvWeek[], legacyDates: Date[]) {
  const weeks = new Map<string, RdvWeek>();
  for (const week of primary) {
    const normalized = fullWeekSpan(week);
    weeks.set(weekKey(normalized), normalized);
  }
  for (const date of legacyDates) {
    const week = reconstructRdvWeek(date);
    if (!weeks.has(weekKey(week))) weeks.set(weekKey(week), week);
  }
  return Array.from(weeks.values()).sort((left, right) => right.weekStart.getTime() - left.weekStart.getTime());
}

function fullWeekSpan(week: RdvWeek): RdvWeek {
  const sunday = new Date(week.weekStart.getTime() - week.weekStart.getUTCDay() * DAY_MS);
  return { weekNumber: week.weekNumber, weekStart: sunday, weekEnd: new Date(sunday.getTime() + 6 * DAY_MS) };
}

function weekKey(week: RdvWeek) {
  const day = week.weekStart.getUTCDay();
  const monday = new Date(week.weekStart.getTime() + (day === 0 ? 1 : 1 - day) * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

function isoWeekNumber(date: Date) {
  const target = new Date(date);
  const isoDay = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - isoDay);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
}
