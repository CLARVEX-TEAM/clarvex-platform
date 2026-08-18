import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import {
  computeAchievement,
  computeAvgTicket,
  computeConversion,
  computeUpt,
  normalizeKpiEntry,
  normalizeTrafficEntry,
  type KpiCaptureEntry,
  type NormalizedKpiEntry,
  type NormalizedTraffic,
  type TrafficCaptureEntry
} from "@/lib/kpi-capture-entry";
import { prisma } from "@/lib/prisma";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";

/**
 * Captura manual de KPIs, la vía que sustituye al RDV.
 *
 * ⚠️ Escribir la fila NO basta. Dos valores que guarda `Kpi` no dependen solo de
 * esa fila, y si no se recalculan quedan mintiendo en silencio:
 *
 *  - `ranking`: es la posición de la persona ESE DÍA frente a sus compañeras.
 *    Capturar a una cambia el puesto de todas las demás.
 *  - `monthlySales` / `monthlyGoal`: acumulados del mes. Capturar un día mueve
 *    el acumulado de todos los días de ese mes para esa persona.
 *
 * Por eso, después de escribir, se recalcula el ranking de cada fecha tocada y
 * el acumulado de cada persona y mes tocados. Es exactamente el trabajo que un
 * `INSERT` desde una herramienta externa se saltaría.
 *
 * El **tráfico de tienda** viaja aparte de `entries` porque no es un dato de
 * persona: se captura una vez por fecha y se escribe igual en la fila de cada
 * asesor de ese día, junto con la conversión que se deriva de él.
 *
 * NO se calculan aquí las comisiones: van contra el mínimo y viven en
 * `lib/commission.ts`.
 */

export type KpiCaptureResult = {
  recordsCreated: number;
  recordsUpdated: number;
  employeesNotFound: string[];
  datesReranked: number;
  monthsRecalculated: number;
  trafficDatesApplied: number;
  errors: string[];
};

export async function captureKpis(
  storeId: string,
  entries: KpiCaptureEntry[],
  traffic: TrafficCaptureEntry[] = []
): Promise<{ ok: false; errors: string[] } | { ok: true; result: KpiCaptureResult }> {
  const normalized: NormalizedKpiEntry[] = [];
  const errors: string[] = [];
  for (const entry of entries) {
    const outcome = normalizeKpiEntry(entry);
    if (outcome.ok) normalized.push(outcome.value);
    else errors.push(outcome.error);
  }
  const normalizedTraffic: NormalizedTraffic[] = [];
  for (const entry of traffic) {
    const outcome = normalizeTrafficEntry(entry);
    if (outcome.ok) normalizedTraffic.push(outcome.value);
    else errors.push(outcome.error);
  }
  if (errors.length > 0) return { ok: false, errors };

  const deduped = Array.from(
    new Map(normalized.map((item) => [`${item.employeeNumber}:${item.date.toISOString()}`, item])).values()
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

  const matched = deduped.flatMap((item) => {
    const userId = userByEmployee.get(item.employeeNumber);
    return userId ? [{ ...item, userId }] : [];
  });
  if (matched.length === 0 && normalizedTraffic.length === 0) {
    return {
      ok: true,
      result: {
        recordsCreated: 0,
        recordsUpdated: 0,
        employeesNotFound,
        datesReranked: 0,
        monthsRecalculated: 0,
        trafficDatesApplied: 0,
        errors: []
      }
    };
  }

  const dates = Array.from(new Map(matched.map((item) => [item.date.toISOString(), item.date])).values());
  const existing = await prisma.kpi.findMany({
    where: { storeId, userId: { in: Array.from(new Set(matched.map((i) => i.userId))) }, date: { in: dates } },
    select: { userId: true, date: true }
  });
  const existingKeys = new Set(existing.map((row) => `${row.userId}:${row.date.toISOString()}`));

  /**
   * ⚠️ Las dos formas de capturar el margen NO se mezclan en una misma semana.
   *
   * El margen semanal vive en la **fila ancla** —el primer día de la semana
   * lleva el total y el resto queda en `null`—. Si a esa semana se le añaden
   * además los importes de cada día, la lectura suma las dos cosas y el
   * descuento sale inflado, sin que nada avise: el margen es un TECHO, así que
   * pasarse se lee como que la tienda descontó de más.
   *
   * `discountDaily` distingue una fila de la otra. Aquí se rechaza escribir el
   * margen del día en una semana que ya trae el semanal, y `lib/discount-capture`
   * hace lo simétrico.
   */
  const marginWeeks = new Map<string, { userId: string; employeeNumber: string; weekNumber: number }>();
  for (const item of matched) {
    if (item.grossSales === null || item.discountAmount === null) continue;
    const { weekNumber } = reconstructRdvWeek(item.date);
    marginWeeks.set(`${item.userId}:${weekNumber}`, { userId: item.userId, employeeNumber: item.employeeNumber, weekNumber });
  }
  const mixed: string[] = [];
  for (const { userId, employeeNumber, weekNumber } of Array.from(marginWeeks.values())) {
    const weekly = await prisma.kpi.findFirst({
      where: { storeId, userId, weekNumber, grossSales: { not: null }, discountDaily: false },
      select: { id: true }
    });
    if (weekly) {
      mixed.push(
        `${employeeNumber}: la semana ${weekNumber} ya tiene el margen capturado POR SEMANA. Bórralo desde Descuentos antes de capturarlo por día, o se sumarían los dos.`
      );
    }
  }
  if (mixed.length > 0) return { ok: false, errors: mixed };

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const writeErrors: string[] = [];

  for (const item of matched) {
    const week = reconstructRdvWeek(item.date);
    // Derivados de la PROPIA fila. Se guardan calculados, no capturados, para
    // que no puedan contradecir a sus sumandos.
    const data = {
      storeId,
      weekNumber: week.weekNumber,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      dailyGoal: item.dailyGoal,
      dailySales: item.dailySales,
      transactions: item.transactions,
      pieces: item.pieces,
      upt: computeUpt(item.pieces, item.transactions),
      avgTicket: computeAvgTicket(item.dailySales, item.transactions),
      // El margen solo se toca cuando viene: capturar KPIs a mano no puede
      // borrar el bruto y el descuento que la fila ya tuviera.
      ...(item.grossSales !== null && item.discountAmount !== null
        ? { grossSales: item.grossSales, discountAmount: item.discountAmount, discountDaily: true }
        : {})
    };
    try {
      await prisma.kpi.upsert({
        where: { userId_date: { userId: item.userId, date: item.date } },
        update: data,
        create: {
          ...data,
          userId: item.userId,
          date: item.date,
          // Obligatorios al crear y NO deducibles de esta fila sola. Se dejan en
          // cero y los fijan `rerankDates` y `recalculateMonths` unas líneas más
          // abajo, que es el mismo orden que sigue el importador del RDV.
          ranking: 0,
          monthlySales: 0,
          monthlyGoal: 0
        }
      });
      if (existingKeys.has(`${item.userId}:${item.date.toISOString()}`)) recordsUpdated += 1;
      else recordsCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      writeErrors.push(`Empleado ${item.employeeNumber}, fecha ${item.date.toISOString().slice(0, 10)}: ${message}`);
    }
  }

  // El tráfico va DESPUÉS de escribir las filas: si se aplicara antes, las que
  // se acaban de crear se quedarían sin él.
  const trafficDatesApplied = await applyTraffic(storeId, normalizedTraffic);
  const datesReranked = await rerankDates(storeId, dates);
  const monthsRecalculated = await recalculateMonths(storeId, matched);

  return {
    ok: true,
    result: {
      recordsCreated,
      recordsUpdated,
      employeesNotFound,
      datesReranked,
      monthsRecalculated,
      trafficDatesApplied,
      errors: writeErrors
    }
  };
}

/**
 * Escribe el tráfico de tienda en TODAS las filas de esa fecha, y recalcula la
 * conversión de cada una.
 *
 * Repetir el mismo número en cada fila parece redundante, pero es justo lo que
 * hace el importador y lo que espera `aggregateStoreTraffic`, que toma el
 * MÁXIMO por fecha —no la suma— precisamente para no multiplicarlo por el
 * número de personas. Guardarlo en una sola fila dejaría al resto sin
 * conversión.
 */
async function applyTraffic(storeId: string, traffic: NormalizedTraffic[]): Promise<number> {
  let applied = 0;
  for (const { date, value } of traffic) {
    const rows = await prisma.kpi.findMany({
      where: { storeId, date },
      select: { id: true, transactions: true }
    });
    if (rows.length === 0) continue;

    for (const row of rows) {
      await prisma.kpi.update({
        where: { id: row.id },
        data: { traffic: value, conversion: computeConversion(row.transactions, value) }
      });
    }
    applied += 1;
  }
  return applied;
}

/**
 * Recalcula el puesto de cada persona en las fechas tocadas.
 *
 * Mismo criterio que `applyKpiRankings` del importador: ordena por alcance
 * descendente y desempata por venta. Se recorre TODA la tienda en esa fecha, no
 * solo lo capturado, porque el puesto es relativo.
 */
async function rerankDates(storeId: string, dates: Date[]): Promise<number> {
  let reranked = 0;
  for (const date of dates) {
    const rows = await prisma.kpi.findMany({
      where: { storeId, date },
      select: { id: true, dailySales: true, dailyGoal: true, ranking: true }
    });
    if (rows.length === 0) continue;

    // Prisma entrega Decimal en las columnas de dinero, no number: sin convertir,
    // las restas darían NaN y el orden saldría arbitrario.
    const ordered = [...rows].sort((left, right) => {
      const diff = computeAchievement(Number(right.dailySales), Number(right.dailyGoal))
        - computeAchievement(Number(left.dailySales), Number(left.dailyGoal));
      return diff !== 0 ? diff : Number(right.dailySales) - Number(left.dailySales);
    });

    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index];
      const ranking = index + 1;
      // Solo se escribe lo que cambia: evita mover `updatedAt` de filas intactas.
      if (row.ranking !== ranking) {
        await prisma.kpi.update({ where: { id: row.id }, data: { ranking } });
      }
    }
    reranked += 1;
  }
  return reranked;
}

/**
 * Recalcula venta y meta acumuladas del mes para cada persona tocada.
 *
 * `monthlyGoal` se toma como la SUMA de las metas diarias del mes. El importador
 * prefería la meta TTLS de la hoja cuando existía, pero esa hoja es justo lo que
 * se deja de leer: sin RDV, la suma de lo capturado es la única definición que
 * se sostiene sola.
 *
 * ⚠️ El mes es el **RETAIL**, no el natural. El 1 de agosto de 2026 es julio
 * retail: contarlo en agosto lo sumaba en los dos meses a la vez —27,246.33 de
 * más en TH SAN AGUSTIN— y dejaba la meta del mes peleada con el período que la
 * app muestra. Es la misma trampa que advierte `CLAUDE.md` en «Asistencia: mes
 * retail vs mes natural», y aquí además se paga: el alcance sale de esta cifra.
 */
export async function recalculateMonths(
  storeId: string,
  matched: Array<{ userId: string; date: Date }>
): Promise<number> {
  const months = new Map<string, { userId: string; from: Date; to: Date }>();
  for (const item of matched) {
    const bounds = retailMonthBoundsFor(item.date);
    const key = `${item.userId}:${bounds.start.toISOString().slice(0, 10)}`;
    if (months.has(key)) continue;
    months.set(key, { userId: item.userId, from: bounds.start, to: bounds.end });
  }

  for (const { userId, from, to } of Array.from(months.values())) {
    const rows = await prisma.kpi.findMany({
      where: { storeId, userId, date: { gte: from, lte: to } },
      select: { id: true, dailySales: true, dailyGoal: true, monthlySales: true, monthlyGoal: true }
    });
    if (rows.length === 0) continue;

    const monthlySales = rows.reduce((sum, row) => sum + Number(row.dailySales), 0);
    const monthlyGoal = rows.reduce((sum, row) => sum + Number(row.dailyGoal), 0);
    const stale = rows.filter(
      (row) => Number(row.monthlySales) !== monthlySales || Number(row.monthlyGoal) !== monthlyGoal
    );
    if (stale.length > 0) {
      await prisma.kpi.updateMany({
        where: { id: { in: stale.map((row) => row.id) } },
        data: { monthlySales, monthlyGoal }
      });
    }
  }
  return months.size;
}
