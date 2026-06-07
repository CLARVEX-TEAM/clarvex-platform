import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { encodeSyncLogMessage, getNextSyncAt, serializeDataSource, type KpiSyncMetrics, type ScheduleSyncMetrics } from "@/lib/data-source";
import { downloadExcelWorkbook, summarizeWorkbook } from "@/lib/excel-proxy";
import { parseKpiWorkbook } from "@/lib/kpi-parser";
import { prisma } from "@/lib/prisma";
import { parseScheduleWorkbook } from "@/lib/schedule-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHEDULE_BATCH_SIZE = 25;
const SCHEDULE_IMPORT_TIMEOUT_MS = 4 * 60 * 1000;
const KPI_BATCH_SIZE = 25;
const KPI_IMPORT_TIMEOUT_MS = 4 * 60 * 1000;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const source = await prisma.dataSource.findFirst({
    where: { id: params.id, storeId: session.storeId }
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
    const syncMetrics = scheduleMetrics ?? kpiMetrics;
    const completedAt = new Date();
    const nextSyncAt = getNextSyncAt(source.frequency, completedAt);
    const successMessage = scheduleMetrics
      ? `Horarios sincronizados: ${scheduleMetrics.recordsCreated} creados, ${scheduleMetrics.recordsUpdated} actualizados, ${scheduleMetrics.errors.length} errores.`
      : kpiMetrics
        ? `${kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated} registros sincronizados`
      : "Sincronizacion completada";
    const recordsProcessed = kpiMetrics
      ? kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated
      : scheduleMetrics
        ? scheduleMetrics.recordsProcessed
      : workbook.recordsProcessed;
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        message: encodeSyncLogMessage(successMessage, workbook.sheets, syncMetrics),
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
        empleadosProcesados: kpiMetrics.employeesProcessed,
        filasLeidas: kpiMetrics.rowsRead,
        registrosSincronizados: kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated,
        registrosCreados: kpiMetrics.recordsCreated,
        registrosActualizados: kpiMetrics.recordsUpdated,
        filasIgnoradas: kpiMetrics.ignoredRows,
        empleadosNoEncontrados: kpiMetrics.employeesNotFound,
        errores: kpiMetrics.errors,
        transaccionesCrmProcesadas: kpiMetrics.crmTransactionsProcessed
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
  logParsedKpiWeeks(parsed.records);
  const users = parsed.employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: { storeId, employeeNumber: { in: parsed.employeeNumbers } },
        select: { id: true, employeeNumber: true }
      })
    : [];
  const userByEmployee = new Map(users.map((user) => [user.employeeNumber, user.id]));
  const employeesNotFound = parsed.employeeNumbers.filter((employeeNumber) => !userByEmployee.has(employeeNumber));
  const matchedRecords = parsed.records.flatMap((record) => {
    const userId = userByEmployee.get(record.employeeNumber);
    return userId ? [{ ...record, userId, ranking: 0, monthlySales: 0, monthlyGoal: 0 }] : [];
  });

  applyKpiRankings(matchedRecords);
  applyMonthlyTotals(matchedRecords);

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
    console.log("Procesando lote de KPIs", {
      lote: Math.floor(batchStart / KPI_BATCH_SIZE) + 1,
      registros: batch.length
    });

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
            pieces: record.pieces,
            transactions: record.transactions,
            ranking: record.ranking
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
            conversion: 0,
            pieces: record.pieces,
            transactions: record.transactions,
            ranking: record.ranking
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

function logParsedKpiWeeks(records: ReturnType<typeof parseKpiWorkbook>["records"]) {
  const weeks = new Map<string, typeof records>();
  for (const record of records) {
    const key = `${record.weekNumber}:${record.weekStart.toISOString()}`;
    weeks.set(key, [...(weeks.get(key) ?? []), record]);
  }
  for (const weekRecords of Array.from(weeks.values())) {
    const first = weekRecords[0];
    console.log("Semana RDV detectada", {
      weekNumber: first.weekNumber,
      weekStart: first.weekStart.toISOString().slice(0, 10),
      weekEnd: first.weekEnd.toISOString().slice(0, 10),
      fechasIncluidas: Array.from(new Set(weekRecords.map((record) => record.date.toISOString().slice(0, 10)))),
      ventaAcumulada: weekRecords.reduce((total, record) => total + record.dailySales, 0),
      metaAcumulada: weekRecords.reduce((total, record) => total + record.dailyGoal, 0)
    });
  }
}

type MatchedKpiRecord = ReturnType<typeof parseKpiWorkbook>["records"][number] & {
  userId: string;
  ranking: number;
  monthlySales: number;
  monthlyGoal: number;
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

function applyMonthlyTotals(records: MatchedKpiRecord[]) {
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
    record.monthlyGoal = total?.goal ?? 0;
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
    employeesProcessed,
    rowsRead: parsed.rowsRead,
    recordsProcessed,
    recordsCreated,
    recordsUpdated,
    employeesNotFound,
    errors,
    crmTransactionsProcessed: parsed.crmTransactionsTotal,
    ignoredRows: parsed.ignoredRows
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
        where: { storeId, employeeNumber: { in: employeeNumbers } },
        select: { id: true, employeeNumber: true }
      })
    : [];
  const userByEmployee = new Map(users.map((user) => [user.employeeNumber, user.id]));
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
    console.log("Procesando lote de horarios", {
      lote: Math.floor(batchStart / SCHEDULE_BATCH_SIZE) + 1,
      registros: batch.length
    });

    for (const record of batch) {
      if (Date.now() - importStartedAt >= SCHEDULE_IMPORT_TIMEOUT_MS) {
        const pendingRecords = matchedRecords.slice(batchStart + batch.indexOf(record));
        errors.push(...pendingRecords.map((pending) => (
          `Empleado ${pending.employeeNumber}, fecha ${pending.date.toISOString().slice(0, 10)}: tiempo maximo de importacion excedido.`
        )));
        console.error("Importacion de horarios detenida por timeout", {
          timeoutMs: SCHEDULE_IMPORT_TIMEOUT_MS,
          registrosPendientes: pendingRecords.length
        });
        return buildScheduleMetrics(parsed, users.length, matchedRecords.length, recordsCreated, recordsUpdated, errors, employeesNotFound);
      }

      console.log("Procesando empleado", record.employeeNumber);
      console.log("Fecha", record.date.toISOString());
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
