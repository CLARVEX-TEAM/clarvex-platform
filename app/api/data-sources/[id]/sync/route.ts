import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { encodeSyncLogMessage, getNextSyncAt, serializeDataSource, type DiscountSyncMetrics, type KpiSyncMetrics, type ScheduleSyncMetrics } from "@/lib/data-source";
import { downloadExcelWorkbook, summarizeWorkbook } from "@/lib/excel-proxy";
import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import { parseKpiWorkbook } from "@/lib/kpi-parser";
import { parsePosDiscountWorkbook } from "@/lib/pos-discount-parser";
import { prisma } from "@/lib/prisma";
import { parseScheduleWorkbook } from "@/lib/schedule-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHEDULE_BATCH_SIZE = 25;
const SCHEDULE_IMPORT_TIMEOUT_MS = 4 * 60 * 1000;
const KPI_BATCH_SIZE = 25;
const KPI_IMPORT_TIMEOUT_MS = 4 * 60 * 1000;
const DISCOUNT_BATCH_SIZE = 25;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const source = await prisma.dataSource.findFirst({
    where: { id, storeId: session.storeId }
  });
  if (!source) return NextResponse.json({ error: "Fuente de datos no encontrada." }, { status: 404 });
  if (source.provider === "MANUAL") {
    return NextResponse.json({ error: "Selecciona Excel o SharePoint para sincronizar este modulo." }, { status: 409 });
  }

  const log = await prisma.syncLog.create({
    data: {
      dataSourceId: source.id,
      status: "RUNNING",
      message: encodeSyncLogMessage("Sincronizacion en curso."),
      recordsProcessed: 0
    }
  });

  try {
    const excelWorkbook = await downloadExcelWorkbook(source.url);
    const workbook = summarizeWorkbook(excelWorkbook);
    const scheduleMetrics = source.type === "HORARIOS"
      ? await importSchedules(excelWorkbook, session.storeId)
      : undefined;
    const kpiMetrics = source.type === "KPIS"
      ? await importKpis(excelWorkbook, session.storeId)
      : undefined;
    const discountMetrics = source.type === "DESCUENTOS_POS"
      ? await importDiscounts(excelWorkbook, session.storeId)
      : undefined;
    const syncMetrics = scheduleMetrics ?? kpiMetrics ?? discountMetrics;
    const completedAt = new Date();
    const nextSyncAt = getNextSyncAt(source.frequency, completedAt);
    const successMessage = scheduleMetrics
      ? `Horarios sincronizados: ${scheduleMetrics.recordsCreated} creados, ${scheduleMetrics.recordsUpdated} actualizados, ${scheduleMetrics.errors.length} errores.`
      : kpiMetrics
        ? `${kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated} registros sincronizados`
        : discountMetrics
          ? `Descuentos sincronizados: ${discountMetrics.recordsUpdated} registros, ${discountMetrics.weekNumbers.length} semanas.`
          : "Sincronizacion completada";
    const recordsProcessed = kpiMetrics
      ? kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated
      : scheduleMetrics
        ? scheduleMetrics.recordsProcessed
        : discountMetrics
          ? discountMetrics.recordsProcessed
          : workbook.recordsProcessed;
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        message: encodeSyncLogMessage(
          successMessage,
          kpiMetrics ? workbook.sheets.filter((sheet) => sheet.name.trim().toLocaleUpperCase("es-MX") === kpiMetrics.sheetUsed.toLocaleUpperCase("es-MX")) : workbook.sheets,
          syncMetrics
        ),
        recordsProcessed
      }
    });
    const updated = await prisma.dataSource.update({
      where: { id: source.id },
      data: { status: "CONNECTED", lastSyncAt: completedAt, nextSyncAt },
      include: { syncLogs: { orderBy: { createdAt: "desc" }, take: 1 } }
    });

    return NextResponse.json({
      message: successMessage,
      workbook,
      ...(scheduleMetrics ? {
        registrosProcesados: scheduleMetrics.recordsProcessed,
        registrosCreados: scheduleMetrics.recordsCreated,
        registrosActualizados: scheduleMetrics.recordsUpdated,
        errores: scheduleMetrics.errors,
        empleadosNoEncontrados: scheduleMetrics.employeesNotFound,
        valoresDesconocidos: scheduleMetrics.unknownValues
      } : kpiMetrics ? {
        hojaUsada: kpiMetrics.sheetUsed,
        semanasDetectadas: kpiMetrics.weeksDetected,
        mesRetail: kpiMetrics.retailMonthLabel,
        inicioMesRetail: kpiMetrics.retailMonthStart,
        finMesRetail: kpiMetrics.retailMonthEnd,
        colaboradoresDetectados: kpiMetrics.collaboratorsDetected,
        empleadosProcesados: kpiMetrics.employeesProcessed,
        filasLeidas: kpiMetrics.rowsRead,
        registrosSincronizados: kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated,
        registrosCreados: kpiMetrics.recordsCreated,
        registrosActualizados: kpiMetrics.recordsUpdated,
        filasIgnoradas: kpiMetrics.ignoredRows,
        totalVentaImportada: kpiMetrics.totalSalesImported,
        totalMetaImportada: kpiMetrics.totalGoalImported,
        empleadosNoEncontrados: kpiMetrics.employeesNotFound,
        errores: kpiMetrics.errors,
        transaccionesCrmProcesadas: kpiMetrics.crmTransactionsProcessed
      } : discountMetrics ? {
        semanasDetectadas: discountMetrics.weekNumbers,
        empleadosEncontrados: discountMetrics.employeesFound,
        registrosProcesados: discountMetrics.recordsProcessed,
        registrosActualizados: discountMetrics.recordsUpdated,
        empleadosNoEncontrados: discountMetrics.employeesNotFound,
        errores: discountMetrics.errors
      } : {}),
      dataSource: serializeDataSource(updated)
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "No se pudo completar la sincronizacion.";
    await Promise.allSettled([
      prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "ERROR", message: encodeSyncLogMessage(errorMessage), recordsProcessed: 0 }
      }),
      prisma.dataSource.update({ where: { id: source.id }, data: { status: "ERROR" } })
    ]);
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}

async function importKpis(workbook: Parameters<typeof parseKpiWorkbook>[0], storeId: string): Promise<KpiSyncMetrics> {
  const parsed = parseKpiWorkbook(workbook);
  logParsedKpiWeeks(parsed);
  const users = parsed.employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: { storeId, OR: [{ employeeNumber: { in: parsed.employeeNumbers } }, { employeeNumberAliases: { some: { employeeNumber: { in: parsed.employeeNumbers } } } }] },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  const employeesNotFound = parsed.employeeNumbers.filter((employeeNumber) => !userByEmployee.has(employeeNumber));
  const matchedRecords = parsed.records.flatMap((record) => {
    const userId = userByEmployee.get(record.employeeNumber);
    const commissionMinimum = parsed.employeeCommissionMinimums[record.employeeNumber] ?? null;
    return userId ? [{ ...record, userId, ranking: 0, monthlySales: 0, monthlyGoal: 0, commissionMinimum }] : [];
  });

  applyKpiRankings(matchedRecords);
  applyMonthlyTotals(matchedRecords, parsed.employeeTtlsGoals);

  const userIds = Array.from(new Set(matchedRecords.map((record) => record.userId)));
  const dates = Array.from(new Map(matchedRecords.map((record) => [record.date.toISOString(), record.date])).values());
  const existing = userIds.length > 0 && dates.length > 0
    ? await prisma.kpi.findMany({
        where: { storeId, userId: { in: userIds }, date: { in: dates } },
        select: { userId: true, date: true }
      })
    : [];
  const existingKeys = new Set(existing.map((kpi) => `${kpi.userId}:${kpi.date.toISOString()}`));
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const errors: string[] = [];
  const importStartedAt = Date.now();

  for (let batchStart = 0; batchStart < matchedRecords.length; batchStart += KPI_BATCH_SIZE) {
    const batch = matchedRecords.slice(batchStart, batchStart + KPI_BATCH_SIZE);
    if (process.env.NODE_ENV !== "production") {
      console.log("Procesando lote de KPIs", { lote: Math.floor(batchStart / KPI_BATCH_SIZE) + 1, registros: batch.length });
    }

    for (let index = 0; index < batch.length; index += 1) {
      const record = batch[index];
      if (Date.now() - importStartedAt >= KPI_IMPORT_TIMEOUT_MS) {
        const pendingRecords = matchedRecords.slice(batchStart + index);
        errors.push(...pendingRecords.map((pending) => (
          `Empleado ${pending.employeeNumber}, fecha ${pending.date.toISOString().slice(0, 10)}: tiempo maximo de importacion excedido.`
        )));
        return buildKpiMetrics(parsed, users.length, matchedRecords.length, recordsCreated, recordsUpdated, employeesNotFound, errors);
      }

      const key = `${record.userId}:${record.date.toISOString()}`;
      try {
        await prisma.kpi.upsert({
          where: { userId_date: { userId: record.userId, date: record.date } },
          update: {
            weekNumber: record.weekNumber,
            weekStart: record.weekStart,
            weekEnd: record.weekEnd,
            dailySales: record.dailySales,
            monthlySales: record.monthlySales,
            dailyGoal: record.dailyGoal,
            monthlyGoal: record.monthlyGoal,
            avgTicket: record.ept,
            upt: record.upt,
            conversion: record.conversion,
            traffic: record.traffic,
            pieces: record.pieces,
            transactions: record.transactions,
            ranking: record.ranking,
            commissionMinimum: record.commissionMinimum
          },
          create: {
            userId: record.userId,
            storeId,
            date: record.date,
            weekNumber: record.weekNumber,
            weekStart: record.weekStart,
            weekEnd: record.weekEnd,
            dailySales: record.dailySales,
            monthlySales: record.monthlySales,
            dailyGoal: record.dailyGoal,
            monthlyGoal: record.monthlyGoal,
            avgTicket: record.ept,
            upt: record.upt,
            conversion: record.conversion,
            traffic: record.traffic,
            pieces: record.pieces,
            transactions: record.transactions,
            ranking: record.ranking,
            commissionMinimum: record.commissionMinimum
          }
        });
        if (existingKeys.has(key)) recordsUpdated += 1;
        else {
          recordsCreated += 1;
          existingKeys.add(key);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        const rowError = `Empleado ${record.employeeNumber}, fecha ${record.date.toISOString().slice(0, 10)}: ${message}`;
        console.error("Error procesando KPI:", rowError);
        errors.push(rowError);
      }
    }
  }

  return buildKpiMetrics(parsed, users.length, matchedRecords.length, recordsCreated, recordsUpdated, employeesNotFound, errors);
}

function logParsedKpiWeeks(parsed: ReturnType<typeof parseKpiWorkbook>) {
  const weeks = new Map<string, typeof parsed.records>();
  for (const record of parsed.records) {
    const key = `${record.weekNumber}:${record.weekStart.toISOString()}`;
    weeks.set(key, [...(weeks.get(key) ?? []), record]);
  }
  for (const week of parsed.weeksDetected) {
    const weekRecords = weeks.get(`${week.weekNumber}:${week.weekStart.toISOString()}`) ?? [];
    if (process.env.NODE_ENV !== "production") {
      console.log("Semana RDV detectada", {
        weekNumber: week.weekNumber,
        weekStart: week.weekStart.toISOString().slice(0, 10),
        weekEnd: week.weekEnd.toISOString().slice(0, 10),
        fechasIncluidas: Array.from(new Set(weekRecords.map((record) => record.date.toISOString().slice(0, 10)))),
        ventaAcumulada: weekRecords.reduce((total, record) => total + record.dailySales, 0),
        metaAcumulada: weekRecords.reduce((total, record) => total + record.dailyGoal, 0)
      });
    }
  }
}

type MatchedKpiRecord = ReturnType<typeof parseKpiWorkbook>["records"][number] & {
  userId: string;
  ranking: number;
  monthlySales: number;
  monthlyGoal: number;
  commissionMinimum: number | null;
};

function applyKpiRankings(records: MatchedKpiRecord[]) {
  const byDate = new Map<string, MatchedKpiRecord[]>();
  for (const record of records) {
    const key = record.date.toISOString();
    byDate.set(key, [...(byDate.get(key) ?? []), record]);
  }
  for (const dailyRecords of Array.from(byDate.values())) {
    dailyRecords.sort((left, right) => right.achievement - left.achievement || right.dailySales - left.dailySales);
    dailyRecords.forEach((record, index) => { record.ranking = index + 1; });
  }
}

function applyMonthlyTotals(records: MatchedKpiRecord[], employeeTtlsGoals: Record<string, number>) {
  const totals = new Map<string, { sales: number; goal: number }>();
  for (const record of records) {
    const key = `${record.userId}:${record.date.toISOString().slice(0, 7)}`;
    const total = totals.get(key) ?? { sales: 0, goal: 0 };
    total.sales += record.dailySales;
    total.goal += record.dailyGoal;
    totals.set(key, total);
  }
  for (const record of records) {
    const total = totals.get(`${record.userId}:${record.date.toISOString().slice(0, 7)}`);
    record.monthlySales = total?.sales ?? 0;
    const ttlsGoal = employeeTtlsGoals[record.employeeNumber];
    record.monthlyGoal = ttlsGoal && ttlsGoal > 0 ? ttlsGoal : (total?.goal ?? 0);
  }
}

function buildKpiMetrics(
  parsed: ReturnType<typeof parseKpiWorkbook>,
  employeesProcessed: number,
  recordsProcessed: number,
  recordsCreated: number,
  recordsUpdated: number,
  employeesNotFound: string[],
  errors: string[]
): KpiSyncMetrics {
  return {
    sheetUsed: parsed.sheetUsed,
    weeksDetected: parsed.weeksDetected.map((week) => ({
      weekNumber: week.weekNumber,
      weekStart: week.weekStart.toISOString().slice(0, 10),
      weekEnd: week.weekEnd.toISOString().slice(0, 10)
    })),
    retailMonthLabel: parsed.retailMonthLabel,
    retailMonthStart: parsed.retailMonthStart.toISOString().slice(0, 10),
    retailMonthEnd: parsed.retailMonthEnd.toISOString().slice(0, 10),
    collaboratorsDetected: parsed.employeeNumbers.length,
    employeesProcessed,
    rowsRead: parsed.rowsRead,
    recordsProcessed,
    recordsCreated,
    recordsUpdated,
    employeesNotFound,
    errors,
    crmTransactionsProcessed: parsed.crmTransactionsTotal,
    totalSalesImported: parsed.totalSalesImported,
    totalGoalImported: parsed.totalGoalImported,
    ignoredRows: parsed.ignoredRows,
    ttlsTraffic: parsed.ttlsTraffic,
    ttlsMeta: parsed.ttlsMeta,
    ttlsSales: parsed.ttlsSales,
    ttlsTransactions: parsed.ttlsTransactions,
    ttlsPieces: parsed.ttlsPieces,
    ttlsCommissionMinimum: parsed.storeTtlsCommissionMinimum
  };
}

async function importSchedules(workbook: Parameters<typeof parseScheduleWorkbook>[0], storeId: string): Promise<ScheduleSyncMetrics> {
  const parsed = parseScheduleWorkbook(workbook);
  if (parsed.weeks.length === 0) {
    throw new Error("No se detectaron bloques semanales validos en el archivo de horarios.");
  }
  const employeeNumbers = parsed.employeeNumbers;
  const users = employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: { storeId, OR: [{ employeeNumber: { in: employeeNumbers } }, { employeeNumberAliases: { some: { employeeNumber: { in: employeeNumbers } } } }] },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  const employeesNotFound = employeeNumbers.filter((employeeNumber) => !userByEmployee.has(employeeNumber));
  const matchedRecords = parsed.records.flatMap((record) => {
    const userId = userByEmployee.get(record.employeeNumber);
    return userId ? [{ ...record, userId }] : [];
  });

  const userIds = Array.from(new Set(matchedRecords.map((record) => record.userId)));
  const dates = Array.from(new Map(matchedRecords.map((record) => [record.date.toISOString(), record.date])).values());
  const existing = userIds.length > 0 && dates.length > 0
    ? await prisma.schedule.findMany({
        where: { storeId, userId: { in: userIds }, date: { in: dates } },
        select: { userId: true, date: true }
      })
    : [];
  const existingKeys = new Set(existing.map((schedule) => `${schedule.userId}:${schedule.date.toISOString()}`));
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const errors: string[] = [];
  const importStartedAt = Date.now();

  for (let batchStart = 0; batchStart < matchedRecords.length; batchStart += SCHEDULE_BATCH_SIZE) {
    const batch = matchedRecords.slice(batchStart, batchStart + SCHEDULE_BATCH_SIZE);
    if (process.env.NODE_ENV !== "production") {
      console.log("Procesando lote de horarios", { lote: Math.floor(batchStart / SCHEDULE_BATCH_SIZE) + 1, registros: batch.length });
    }

    for (const record of batch) {
      if (Date.now() - importStartedAt >= SCHEDULE_IMPORT_TIMEOUT_MS) {
        const pendingRecords = matchedRecords.slice(batchStart + batch.indexOf(record));
        errors.push(...pendingRecords.map((pending) => (
          `Empleado ${pending.employeeNumber}, fecha ${pending.date.toISOString().slice(0, 10)}: tiempo maximo de importacion excedido.`
        )));
        return buildScheduleMetrics(parsed, users.length, matchedRecords.length, recordsCreated, recordsUpdated, errors, employeesNotFound);
      }

      const existingKey = `${record.userId}:${record.date.toISOString()}`;
      const data = {
        storeId,
        day: record.day,
        status: record.status,
        statusRaw: record.statusRaw,
        startTime: null,
        endTime: null,
        weekStart: record.weekStart
      };

      try {
        await prisma.schedule.upsert({
          where: { userId_date: { userId: record.userId, date: record.date } },
          update: data,
          create: { ...data, userId: record.userId, date: record.date }
        });
        if (existingKeys.has(existingKey)) {
          recordsUpdated += 1;
        } else {
          recordsCreated += 1;
          existingKeys.add(existingKey);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        const rowError = `Empleado ${record.employeeNumber}, fecha ${record.date.toISOString().slice(0, 10)}: ${message}`;
        console.error("Error procesando horario:", rowError);
        errors.push(rowError);
      }
    }
  }

  return buildScheduleMetrics(parsed, users.length, matchedRecords.length, recordsCreated, recordsUpdated, errors, employeesNotFound);
}

function buildScheduleMetrics(
  parsed: ReturnType<typeof parseScheduleWorkbook>,
  employeesFound: number,
  recordsProcessed: number,
  recordsCreated: number,
  recordsUpdated: number,
  errors: string[],
  employeesNotFound: string[]
): ScheduleSyncMetrics {
  return {
    weeksProcessed: parsed.weeks.length,
    employeesFound,
    recordsProcessed,
    recordsCreated,
    recordsUpdated,
    errors,
    employeesNotFound,
    unknownValues: parsed.unknownValues
  };
}

async function importDiscounts(workbook: Parameters<typeof parsePosDiscountWorkbook>[0], storeId: string): Promise<DiscountSyncMetrics> {
  const parsed = parsePosDiscountWorkbook(workbook);
  const errors: string[] = [];

  const users = parsed.employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: { storeId, OR: [{ employeeNumber: { in: parsed.employeeNumbers } }, { employeeNumberAliases: { some: { employeeNumber: { in: parsed.employeeNumbers } } } }] },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  const employeesNotFound = parsed.employeeNumbers.filter((n) => !userByEmployee.has(n));

  // Group records by employee+week to get weekly totals
  type WeekKey = string;
  const byEmployeeWeek = new Map<WeekKey, typeof parsed.records[number]>();
  for (const record of parsed.records) {
    byEmployeeWeek.set(`${record.employeeNumber}:${record.weekNumber}`, record);
  }

  let recordsProcessed = 0;
  let recordsUpdated = 0;

  for (const [key, record] of Array.from(byEmployeeWeek)) {
    const userId = userByEmployee.get(record.employeeNumber);
    if (!userId) continue;
    recordsProcessed += 1;

    // Find all KPI records for this employee in this week, sorted by date ascending
    const weekKpis = await prisma.kpi.findMany({
      where: { storeId, userId, weekNumber: record.weekNumber },
      orderBy: { date: "asc" },
      select: { id: true, date: true }
    });

    if (weekKpis.length === 0) {
      errors.push(`Empleado ${record.employeeNumber}, semana ${record.weekNumber}: no se encontraron registros KPI.`);
      continue;
    }

    try {
      // Anchor record (first day of week) receives the weekly totals
      const anchor = weekKpis[0];
      await prisma.kpi.update({
        where: { id: anchor.id },
        data: {
          grossSales: record.grossSales,
          discountAmount: record.discountAmount,
          discountMargin: record.discountMargin
        }
      });

      // All other records in the same week get null (totals live only on anchor)
      const restIds = weekKpis.slice(1).map((k) => k.id);
      if (restIds.length > 0) {
        await prisma.kpi.updateMany({
          where: { id: { in: restIds } },
          data: { grossSales: null, discountAmount: null, discountMargin: null }
        });
      }
      recordsUpdated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      errors.push(`Empleado ${record.employeeNumber}, semana ${record.weekNumber}: ${message}`);
      if (process.env.NODE_ENV !== "production") {
        console.error(`Error procesando descuento [${key}]:`, message);
      }
    }
  }

  return {
    sheetsUsed: Object.keys(workbook).filter((name) => ["Margen DTO", "DESCUENTOS POS", "Descuentos", "Margen"].includes(name)),
    weekNumbers: parsed.weekNumbers,
    employeesFound: users.length,
    recordsProcessed,
    recordsUpdated,
    employeesNotFound,
    errors
  };
}
