import {
  normalizeDiscountEntry,
  type DiscountCaptureEntry,
  type NormalizedDiscountEntry
} from "@/lib/discount-capture-entry";
import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import { prisma } from "@/lib/prisma";

/**
 * Captura manual del margen DTO (descuentos del punto de venta).
 *
 * ⚠️ Esta fuente NO crea filas propias. El margen es un dato SEMANAL y `Kpi` es
 * diaria, así que se guarda en la **primera fila de la semana** y en el resto
 * queda `null`. Es el patrón de fila ancla: si el mismo importe se repitiera en
 * los siete días, cualquier suma semanal lo multiplicaría por siete.
 *
 * Consecuencia directa: **hace falta que ya existan KPIs de esa semana.** Si no
 * los hay, no hay dónde anclar y se avisa en vez de crear filas a medias — una
 * fila de KPI inventada solo para colgar un descuento falsearía venta y metas.
 *
 * Espejo de `importDiscounts` en `lib/data-source-sync.ts:743-788`.
 */

export type DiscountCaptureResult = {
  weeksUpdated: number;
  employeesNotFound: string[];
  weeksWithoutKpis: string[];
  errors: string[];
};

export async function captureDiscounts(
  storeId: string,
  entries: DiscountCaptureEntry[]
): Promise<{ ok: false; errors: string[] } | { ok: true; result: DiscountCaptureResult }> {
  const normalized: NormalizedDiscountEntry[] = [];
  const errors: string[] = [];
  for (const entry of entries) {
    const outcome = normalizeDiscountEntry(entry);
    if (outcome.ok) normalized.push(outcome.value);
    else errors.push(outcome.error);
  }
  if (errors.length > 0) return { ok: false, errors };

  // Una misma persona y semana enviadas dos veces: gana la última.
  const deduped = Array.from(
    new Map(normalized.map((item) => [`${item.employeeNumber}:${item.weekNumber}`, item])).values()
  );

  const employeeNumbers = Array.from(new Set(deduped.map((item) => item.employeeNumber)));
  const users = employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: {
          storeId,
          OR: [
            { employeeNumber: { in: employeeNumbers } },
            { employeeNumberAliases: { some: { employeeNumber: { in: employeeNumbers } } } }
          ]
        },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  const employeesNotFound = employeeNumbers.filter((number) => !userByEmployee.has(number));

  let weeksUpdated = 0;
  const weeksWithoutKpis: string[] = [];
  const writeErrors: string[] = [];

  for (const item of deduped) {
    const userId = userByEmployee.get(item.employeeNumber);
    if (!userId) continue;

    // Se agrupa por weekNumber, NO por weekStart: en esta tabla `weekStart` vale
    // lo mismo que `date` en cada fila, así que agrupar por él daría una
    // "semana" por día. Ver la advertencia en CLAUDE.md.
    const weekKpis = await prisma.kpi.findMany({
      where: { storeId, userId, weekNumber: item.weekNumber },
      orderBy: { date: "asc" },
      select: { id: true }
    });

    if (weekKpis.length === 0) {
      weeksWithoutKpis.push(`${item.employeeNumber} (semana ${item.weekNumber})`);
      continue;
    }

    try {
      // El ancla —el primer día de la semana— recibe los totales.
      await prisma.kpi.update({
        where: { id: weekKpis[0].id },
        data: {
          grossSales: item.grossSales,
          discountAmount: item.discountAmount,
          discountMargin: item.discountMargin
        }
      });

      // Y el resto de la semana se limpia, para que ninguna suma cuente doble.
      const restIds = weekKpis.slice(1).map((row) => row.id);
      if (restIds.length > 0) {
        await prisma.kpi.updateMany({
          where: { id: { in: restIds } },
          data: { grossSales: null, discountAmount: null, discountMargin: null }
        });
      }
      weeksUpdated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      writeErrors.push(`Empleado ${item.employeeNumber}, semana ${item.weekNumber}: ${message}`);
    }
  }

  return {
    ok: true,
    result: { weeksUpdated, employeesNotFound, weeksWithoutKpis, errors: writeErrors }
  };
}
