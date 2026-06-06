import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { encodeSyncLogMessage, getNextSyncAt, serializeDataSource, type ScheduleSyncMetrics } from "@/lib/data-source";
import { downloadExcelWorkbook, summarizeWorkbook } from "@/lib/excel-proxy";
import { prisma } from "@/lib/prisma";
import { parseScheduleWorkbook } from "@/lib/schedule-parser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
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
    const completedAt = new Date();
    const nextSyncAt = getNextSyncAt(source.frequency, completedAt);
    const successMessage = scheduleMetrics
      ? `Horarios sincronizados: ${scheduleMetrics.recordsCreated} creados, ${scheduleMetrics.recordsUpdated} actualizados.`
      : "Sincronizacion completada";
    const recordsProcessed = scheduleMetrics
      ? scheduleMetrics.recordsCreated + scheduleMetrics.recordsUpdated
      : workbook.recordsProcessed;
    const [, updated] = await prisma.$transaction([
      prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "SUCCESS",
          message: encodeSyncLogMessage(successMessage, workbook.sheets, scheduleMetrics),
          recordsProcessed
        }
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { status: "CONNECTED", lastSyncAt: completedAt, nextSyncAt },
        include: { syncLogs: { orderBy: { createdAt: "desc" }, take: 1 } }
      })
    ]);

    return NextResponse.json({
      message: successMessage,
      workbook,
      dataSource: serializeDataSource(updated)
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "No se pudo completar la sincronizacion.";
    await prisma.$transaction([
      prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "ERROR", message: encodeSyncLogMessage(errorMessage), recordsProcessed: 0 }
      }),
      prisma.dataSource.update({ where: { id: source.id }, data: { status: "ERROR" } })
    ]);
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
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
  const recordsUpdated = matchedRecords.filter((record) => existingKeys.has(`${record.userId}:${record.date.toISOString()}`)).length;
  const recordsCreated = matchedRecords.length - recordsUpdated;

  await prisma.$transaction(async (transaction) => {
    for (const record of matchedRecords) {
      const data = {
        storeId,
        day: record.day,
        status: record.status,
        statusRaw: record.statusRaw,
        startTime: null,
        endTime: null,
        weekStart: record.weekStart
      };
      await transaction.schedule.upsert({
        where: { userId_date: { userId: record.userId, date: record.date } },
        update: data,
        create: { ...data, userId: record.userId, date: record.date }
      });
    }
  });

  return {
    weeksProcessed: parsed.weeks.length,
    employeesFound: users.length,
    recordsCreated,
    recordsUpdated,
    employeesNotFound,
    unknownValues: parsed.unknownValues
  };
}
