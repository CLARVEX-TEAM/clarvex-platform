import { reconstructRdvWeek } from "@/lib/rdv-week";

const DAY_MS = 86_400_000;

/** Normaliza los dos selectores independientes a semanas retail domingo-sábado. */
export function weeklyPerformancePeriods(reportDate: Date, quotaDate?: Date) {
  const report = reconstructRdvWeek(reportDate);
  const quota = reconstructRdvWeek(quotaDate ?? new Date(report.weekStart.getTime() + 7 * DAY_MS));
  return { report, quota };
}
