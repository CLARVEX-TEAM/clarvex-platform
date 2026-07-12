import { retailTodayUtc } from "@/lib/ai/context";
import type { KpiImportSource } from "@prisma/client";

/** RDV no pisa KPIs de hoy importados por Power BI (puente temporal). */
export function shouldRdvSkipKpiUpdate(input: {
  importSource: KpiImportSource | null | undefined;
  date: Date;
  now?: Date;
}): boolean {
  if (input.importSource !== "POWER_BI") return false;
  const today = retailTodayUtc(input.now ?? new Date());
  const recordDay = new Date(Date.UTC(
    input.date.getUTCFullYear(),
    input.date.getUTCMonth(),
    input.date.getUTCDate()
  ));
  return recordDay.getTime() === today.getTime();
}
