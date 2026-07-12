import { matchTeammatesByQuery } from "@/lib/ai/tools/person-query";
import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import { calendarFilterToDate, resolveRetailCalendarFilter } from "@/lib/integrations/power-bi-calendar";
import { getPowerBiAccessTokenForStore } from "@/lib/integrations/power-bi-auth";
import { exportPowerBI } from "@/lib/integrations/power-bi-export";
import { PowerBiExportError } from "@/lib/integrations/power-bi-errors";
import {
  parsePowerBiKpiWorkbook,
  type PowerBiKpiRow
} from "@/lib/integrations/power-bi-kpi-parser";
import {
  patchRetailCalendarFilters
} from "@/lib/integrations/power-bi-payload";
import { reconstructRdvWeek } from "@/lib/rdv-week";
import { read as readSpreadsheet } from "@/lib/spreadsheet";
import { prisma } from "@/lib/prisma";

export type PowerBiSyncMetrics = {
  sheetUsed: string;
  syncDate: string;
  collaboratorsDetected: number;
  employeesProcessed: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  employeesNotFound: string[];
  employeesNotFoundNamed: Array<{ employeeNumber: string; name: string }>;
  totalSalesImported: number;
  errors: string[];
};

export type PowerBiSyncResult =
  | { ok: true; message: string; metrics: PowerBiSyncMetrics; bytes: number }
  | { ok: false; error: string };

const KPI_BATCH_SIZE = 25;

type MatchedPowerBiEmployee = PowerBiKpiRow & {
  userId: string;
  employeeNumber: string;
};

async function matchPowerBiEmployees(storeId: string, rows: PowerBiKpiRow[]) {
  const users = await prisma.user.findMany({
    where: { storeId, active: true },
    select: {
      id: true,
      name: true,
      employeeNumber: true,
      employeeNumberAliases: { select: { employeeNumber: true } }
    }
  });

  const userByEmployee = buildUserByEmployeeNumber(users);
  const matched: MatchedPowerBiEmployee[] = [];
  const employeesNotFound: string[] = [];
  const employeesNotFoundNamed: Array<{ employeeNumber: string; name: string }> = [];

  for (const row of rows) {
    let userId = row.employeeNumber ? userByEmployee.get(row.employeeNumber) : undefined;
    if (!userId) {
      const nameMatches = matchTeammatesByQuery(users, row.employeeLabel);
      if (nameMatches.length === 1) userId = nameMatches[0].id;
    }
    if (!userId) {
      employeesNotFound.push(row.employeeKey);
      employeesNotFoundNamed.push({
        employeeNumber: row.employeeNumber || row.employeeKey,
        name: row.employeeLabel
      });
      continue;
    }

    const employeeNumber = row.employeeNumber || users.find((user) => user.id === userId)?.employeeNumber || row.employeeKey;
    matched.push({
      ...row,
      userId,
      employeeNumber
    });
  }

  return { matched, employeesNotFound, employeesNotFoundNamed, employeesProcessed: users.length };
}

async function recomputeMonthlySales(storeId: string, userIds: string[], date: Date) {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  for (const userId of userIds) {
    const monthRows = await prisma.kpi.findMany({
      where: { storeId, userId, date: { gte: monthStart, lte: monthEnd } },
      select: { id: true, dailySales: true, dailyGoal: true, monthlyGoal: true }
    });
    if (monthRows.length === 0) continue;

    const monthlySales = monthRows.reduce((total, row) => total + Number(row.dailySales), 0);
    const monthlyGoal = monthRows.reduce((max, row) => Math.max(max, Number(row.monthlyGoal)), 0)
      || monthRows.reduce((total, row) => total + Number(row.dailyGoal), 0);

    await prisma.kpi.updateMany({
      where: { id: { in: monthRows.map((row) => row.id) } },
      data: { monthlySales, monthlyGoal }
    });
  }
}

async function recomputeRankings(storeId: string, date: Date) {
  const rows = await prisma.kpi.findMany({
    where: { storeId, date },
    select: { id: true, dailySales: true, dailyGoal: true }
  });
  if (rows.length === 0) return;

  const sorted = [...rows].sort((left, right) => {
    const leftAchievement = Number(left.dailyGoal) > 0 ? Number(left.dailySales) / Number(left.dailyGoal) : 0;
    const rightAchievement = Number(right.dailyGoal) > 0 ? Number(right.dailySales) / Number(right.dailyGoal) : 0;
    return rightAchievement - leftAchievement || Number(right.dailySales) - Number(left.dailySales);
  });

  await Promise.all(
    sorted.map((row, index) => prisma.kpi.update({
      where: { id: row.id },
      data: { ranking: index + 1 }
    }))
  );
}

export async function syncPowerBiKpis(
  storeId: string,
  calendar?: Partial<PowerBiCalendarFilter>
): Promise<PowerBiSyncResult> {
  const connection = await prisma.storePowerBiConnection.findUnique({ where: { storeId } });
  if (!connection) {
    return { ok: false, error: "Power BI no está conectado. Pega un token de DevTools o conecta con Microsoft." };
  }

  const filter = resolveRetailCalendarFilter(calendar);
  const syncDate = calendarFilterToDate(filter);
  const week = reconstructRdvWeek(syncDate);

  try {
    const accessToken = await getPowerBiAccessTokenForStore(storeId);
    const payload = patchRetailCalendarFilters(
      connection.exportPayloadTemplate as Record<string, unknown>,
      filter
    );
    const buffer = await exportPowerBI(accessToken, payload, connection.exportUrl);
    const workbook = await readSpreadsheet(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    );
    const parsed = parsePowerBiKpiWorkbook(workbook);
    const { matched, employeesNotFound, employeesNotFoundNamed, employeesProcessed } =
      await matchPowerBiEmployees(storeId, parsed.rows);

    const datedRecords = matched.map((record) => ({
      ...record,
      date: syncDate,
      weekNumber: week.weekNumber,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd
    }));

    const userIds = Array.from(new Set(datedRecords.map((record) => record.userId)));
    const existing = userIds.length > 0
      ? await prisma.kpi.findMany({
          where: { storeId, userId: { in: userIds }, date: syncDate },
          select: { userId: true, dailyGoal: true, monthlyGoal: true, commissionMinimum: true, traffic: true }
        })
      : [];
    const existingByUser = new Map(existing.map((row) => [row.userId, row]));
    const existingKeys = new Set(existing.map((row) => row.userId));

    let recordsCreated = 0;
    let recordsUpdated = 0;
    const errors: string[] = [];

    for (let batchStart = 0; batchStart < datedRecords.length; batchStart += KPI_BATCH_SIZE) {
      const batch = datedRecords.slice(batchStart, batchStart + KPI_BATCH_SIZE);
      for (const record of batch) {
        const previous = existingByUser.get(record.userId);
        const dailyGoal = previous ? Number(previous.dailyGoal) : 0;
        const monthlyGoal = previous ? Number(previous.monthlyGoal) : 0;
        const commissionMinimum = previous?.commissionMinimum ?? null;
        const traffic = previous?.traffic ?? null;
        const keyExists = existingKeys.has(record.userId);

        try {
          await prisma.kpi.upsert({
            where: { userId_date: { userId: record.userId, date: syncDate } },
            update: {
              importSource: "POWER_BI",
              dailySales: record.dailySales,
              transactions: record.transactions,
              pieces: record.pieces,
              avgTicket: record.ept,
              upt: record.upt,
              conversion: record.conversion,
              weekNumber: record.weekNumber,
              weekStart: record.weekStart,
              weekEnd: record.weekEnd
            },
            create: {
              userId: record.userId,
              storeId,
              date: syncDate,
              importSource: "POWER_BI",
              weekNumber: record.weekNumber,
              weekStart: record.weekStart,
              weekEnd: record.weekEnd,
              dailySales: record.dailySales,
              monthlySales: record.dailySales,
              dailyGoal,
              monthlyGoal,
              avgTicket: record.ept,
              upt: record.upt,
              conversion: record.conversion,
              traffic,
              pieces: record.pieces,
              transactions: record.transactions,
              ranking: 0,
              commissionMinimum
            }
          });
          if (keyExists) recordsUpdated += 1;
          else {
            recordsCreated += 1;
            existingKeys.add(record.userId);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido";
          errors.push(`Empleado ${record.employeeLabel}: ${message}`);
        }
      }
    }

    await recomputeMonthlySales(storeId, userIds, syncDate);
    await recomputeRankings(storeId, syncDate);

    const totalSalesImported = datedRecords.reduce((total, record) => total + record.dailySales, 0);
    const metrics: PowerBiSyncMetrics = {
      sheetUsed: parsed.sheetUsed,
      syncDate: syncDate.toISOString().slice(0, 10),
      collaboratorsDetected: parsed.employeeKeys.length,
      employeesProcessed,
      recordsProcessed: datedRecords.length,
      recordsCreated,
      recordsUpdated,
      employeesNotFound,
      employeesNotFoundNamed,
      totalSalesImported,
      errors
    };

    const unmatchedSuffix = employeesNotFound.length > 0
      ? ` ${employeesNotFound.length} colaborador(es) sin match en Clarvex.`
      : "";
    const errorSuffix = errors.length > 0 ? ` ${errors.length} error(es).` : "";
    const bridgeSuffix = " El RDV de hoy no sobrescribirá estos datos.";

    return {
      ok: true,
      message: `KPIs sincronizados para ${filter.day}/${filter.month}/${filter.year}: ${recordsCreated} creados, ${recordsUpdated} actualizados.${unmatchedSuffix}${errorSuffix}${bridgeSuffix}`,
      metrics,
      bytes: buffer.length
    };
  } catch (error) {
    const message = error instanceof PowerBiExportError
      ? error.message
      : error instanceof Error
        ? error.message
        : "No se pudo sincronizar KPIs desde Power BI.";
    return { ok: false, error: message };
  }
}
