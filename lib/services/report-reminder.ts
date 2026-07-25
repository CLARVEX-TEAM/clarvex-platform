import { buildRetailMonths } from "@/lib/kpi-period";
import { prisma } from "@/lib/prisma";
import { mergeRdvWeeks } from "@/lib/rdv-week";
import { reminderFor, type Reminder } from "@/lib/report-deadlines";

/**
 * Fin del mes retail que contiene `today` SEGÚN LAS SEMANAS YA CARGADAS del RDV.
 *
 * Devuelve null si el RDV todavía no cubre ese mes: en ese caso el recordatorio
 * usa la regla del calendario retail, que sí conoce las 5 semanas por adelantado.
 * Solo se busca el mes que contiene hoy — nunca se cae al último mes disponible,
 * porque eso apuntaría a un cierre de otro periodo.
 */
export async function rdvMonthEndFor(storeId: string, today: Date): Promise<Date | null> {
  const rows = await prisma.kpi.findMany({
    where: { storeId, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null } },
    distinct: ["weekStart", "weekNumber"],
    select: { weekNumber: true, weekStart: true, weekEnd: true },
    orderBy: { weekStart: "desc" },
    take: 60
  });
  const weeks = rows.flatMap((row) => (
    row.weekNumber !== null && row.weekStart && row.weekEnd
      ? [{ weekNumber: row.weekNumber, weekStart: row.weekStart, weekEnd: row.weekEnd }]
      : []
  ));
  if (weeks.length === 0) return null;
  const month = buildRetailMonths(mergeRdvWeeks(weeks, []))
    .find((candidate) => today >= candidate.start && today <= candidate.end);
  return month?.end ?? null;
}

/** Entregas de esta tienda ya confirmadas como subidas. */
export async function confirmedPeriodKeys(storeId: string): Promise<string[]> {
  const rows = await prisma.reportDelivery.findMany({
    where: { storeId },
    select: { periodKey: true },
    orderBy: { createdAt: "desc" },
    take: 40
  });
  return rows.map((row) => row.periodKey);
}

/** El recordatorio vigente de una tienda, o null si hoy no toca (o ya se confirmó). */
export async function reminderForStore(storeId: string, today: Date): Promise<Reminder | null> {
  const [rdvMonthEnd, confirmed] = await Promise.all([
    rdvMonthEndFor(storeId, today),
    confirmedPeriodKeys(storeId)
  ]);
  return reminderFor(today, { rdvMonthEnd, confirmedPeriodKeys: confirmed });
}
