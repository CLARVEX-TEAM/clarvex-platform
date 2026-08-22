import { reconstructRdvWeek } from "@/lib/rdv-week";

const DAY_MS = 86_400_000;

/** La fecha seleccionada identifica el RDS; la Cuota Justa siempre es +1 semana. */
export function weeklyPerformancePeriods(requestedDate: Date) {
  const report = reconstructRdvWeek(requestedDate);
  const quota = reconstructRdvWeek(new Date(report.weekStart.getTime() + 7 * DAY_MS));
  return { report, quota };
}
