import { retailTodayUtc } from "@/lib/ai/context";
import type { PowerBiCalendarFilter } from "@/lib/integrations/power-bi-payload";

export function resolveRetailCalendarFilter(
  filter?: Partial<PowerBiCalendarFilter>,
  now = new Date()
): PowerBiCalendarFilter {
  if (filter?.day && filter.month && filter.year) {
    return { day: filter.day, month: filter.month, year: filter.year };
  }
  const today = retailTodayUtc(now);
  return {
    day: today.getUTCDate(),
    month: today.getUTCMonth() + 1,
    year: today.getUTCFullYear()
  };
}

export function calendarFilterToDate(filter: PowerBiCalendarFilter): Date {
  return new Date(Date.UTC(filter.year, filter.month - 1, filter.day));
}
