import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { decodeSyncLogMessage, type KpiSyncMetrics } from "@/lib/data-source";
import { buildRetailMonths, periodDateKey, selectRdvWeek, selectRetailMonth } from "@/lib/kpi-period";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";
import { buildManagerDashboardMetric } from "@/lib/retool-manager-dashboard";
import { buildStoreAudit } from "@/lib/retool-store-audit";
import {
  addDays,
  buildAgentPeriods,
  buildStoreAgent,
  buildWeeklyPerformanceActions,
  tieneCaptura
} from "@/lib/retool-store-agent";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";
import { mergeRdvWeeks, reconstructRdvWeek } from "@/lib/rdv-week";
import { ADVISOR_WHERE, PERSON_WHERE } from "@/lib/store-people";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({ storeId: z.string().min(1).max(64) });

function number(value: { toString(): string } | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function maybeDateKey(value: Date | null | undefined): string | null {
  return value ? dateKey(value) : null;
}

function daysBetween(leftKey: string, rightKey: string): number {
  const left = Date.parse(`${leftKey}T00:00:00.000Z`);
  const right = Date.parse(`${rightKey}T00:00:00.000Z`);
  return Math.round((right - left) / 86_400_000);
}

function minDate(left: Date, right: Date): Date {
  return left.getTime() < right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() > right.getTime() ? left : right;
}

function stableActionId(source: string, title: string, index: number): string {
  return `${source}-${title}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isKpiSyncMetrics(details: unknown): details is KpiSyncMetrics {
  return typeof details === "object" && details !== null && "sheetUsed" in details && "weeksDetected" in details && Array.isArray((details as KpiSyncMetrics).weeksDetected);
}

/**
 * Inicio gerencial para el nuevo App Builder de Retool.
 *
 * Es deliberadamente pequeño y de solo lectura. No reutiliza `/api/app-data`
 * porque esa respuesta contiene historial, saldos y evidencias que el Inicio no
 * necesita. La función backend de Retool obtiene `storeId` de los atributos del
 * usuario con `requireManagerIdentity`; el navegador nunca ofrece un selector
 * ni manda una tienda elegida por el usuario.
 */
export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const parsed = querySchema.safeParse({
    storeId: new URL(request.url).searchParams.get("storeId") ?? ""
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Tienda inválida." }, { status: 400 });
  }

  const storeId = parsed.data.storeId;
  const today = dashboardDateKey();
  const todayRange = dashboardDateRange(today);
  const [availableWeekRows, legacyWeekRows, latestKpiSource] = await Promise.all([
    prisma.kpi.findMany({
      where: { storeId, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null }, user: PERSON_WHERE },
      distinct: ["weekStart", "weekNumber"],
      select: { weekNumber: true, weekStart: true, weekEnd: true },
      orderBy: { weekStart: "desc" }
    }),
    prisma.kpi.findMany({
      where: { storeId, OR: [{ weekNumber: null }, { weekStart: null }, { weekEnd: null }], user: PERSON_WHERE },
      distinct: ["date"],
      select: { date: true },
      orderBy: { date: "desc" }
    }),
    prisma.dataSource.findFirst({
      where: { storeId, type: "KPIS" },
      include: { syncLogs: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 8 } }
    })
  ]);
  const latestDetails = latestKpiSource?.syncLogs[0] ? decodeSyncLogMessage(latestKpiSource.syncLogs[0].message).details : null;
  const syncedWeeks = isKpiSyncMetrics(latestDetails) ? latestDetails.weeksDetected.map((week) => ({
    weekNumber: week.weekNumber,
    weekStart: new Date(`${week.weekStart}T00:00:00.000Z`),
    weekEnd: new Date(`${week.weekEnd}T00:00:00.000Z`)
  })) : [];
  const persistedWeeks = availableWeekRows.flatMap((week) =>
    week.weekNumber !== null && week.weekStart && week.weekEnd
      ? [{ weekNumber: week.weekNumber, weekStart: week.weekStart, weekEnd: week.weekEnd }]
      : []
  );
  const availableWeeks = mergeRdvWeeks([...persistedWeeks, ...syncedWeeks], legacyWeekRows.map((row) => row.date))
    .sort((left, right) => left.weekStart.getTime() - right.weekStart.getTime());
  const retailMonths = buildRetailMonths(availableWeeks);
  const detectedRetailMonth = selectRetailMonth(retailMonths, todayRange.start);
  const currentRetailMonth = retailMonthBoundsFor(todayRange.start);
  const selectedRetailMonth = detectedRetailMonth && todayRange.start >= detectedRetailMonth.start && todayRange.start <= detectedRetailMonth.end
    ? { ...detectedRetailMonth, start: currentRetailMonth.start, end: currentRetailMonth.end }
    : detectedRetailMonth ?? currentRetailMonth;
  const selectedWeek = selectRdvWeek(availableWeeks, todayRange.start) ?? availableWeeks.at(-1) ?? reconstructRdvWeek(todayRange.start);
  const selectedWeekIndex = availableWeeks.findIndex((week) => week.weekStart.getTime() === selectedWeek.weekStart.getTime());
  const previousWeek = selectedWeekIndex > 0 ? availableWeeks[selectedWeekIndex - 1] : null;
  const previousWeekStart = previousWeek?.weekStart ?? addDays(selectedWeek.weekStart, -7);
  const previousWeekEnd = previousWeek?.weekEnd ?? addDays(selectedWeek.weekStart, -1);
  const selectedMonthIndex = retailMonths.findIndex((month) => month.start.getTime() === selectedRetailMonth.start.getTime());
  const previousMonthFromList = selectedMonthIndex > 0 ? retailMonths[selectedMonthIndex - 1] : null;
  const previousMonth = previousMonthFromList ?? retailMonthBoundsFor(addDays(selectedRetailMonth.start, -1));
  const beforePreviousMonthFromList = selectedMonthIndex > 1 ? retailMonths[selectedMonthIndex - 2] : null;
  const beforePreviousMonth = beforePreviousMonthFromList ?? retailMonthBoundsFor(addDays(previousMonth.start, -1));
  const contextStart = minDate(beforePreviousMonth.start, previousWeekStart);
  const contextEnd = maxDate(selectedRetailMonth.end, selectedWeek.weekEnd);

  const [
    store,
    todayRows,
    monthTotals,
    periodRows,
    advisors,
    schedules,
    attendance,
    pendings,
    highPriorityPendings,
    pendingRequests,
    openInventoryRounds,
    weeklyPerformanceCloses,
    latestKpi
  ] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, kpisEnabled: true } }),
    prisma.kpi.findMany({
      where: { storeId, date: { gte: todayRange.start, lt: todayRange.end }, user: PERSON_WHERE },
      include: { user: { select: { id: true, name: true, employeeNumber: true, role: true } } },
      orderBy: [{ dailySales: "desc" }, { user: { name: "asc" } }]
    }),
    prisma.kpi.aggregate({
      where: { storeId, date: { gte: selectedRetailMonth.start, lte: selectedRetailMonth.end }, user: PERSON_WHERE },
      _sum: { dailySales: true, dailyGoal: true, transactions: true, pieces: true }
    }),
    prisma.kpi.findMany({
      where: { storeId, date: { gte: contextStart, lte: contextEnd }, user: PERSON_WHERE },
      select: { date: true, dailySales: true, dailyGoal: true, transactions: true, pieces: true, traffic: true }
    }),
    prisma.user.findMany({
      where: { storeId, ...ADVISOR_WHERE },
      select: { id: true, name: true, employeeNumber: true, photoUrl: true },
      orderBy: { name: "asc" }
    }),
    prisma.schedule.findMany({
      where: { storeId, date: { gte: todayRange.start, lt: todayRange.end }, user: PERSON_WHERE },
      select: { userId: true, status: true, startTime: true, endTime: true }
    }),
    prisma.attendance.findMany({
      where: {
        storeId,
        date: { gte: todayRange.start, lt: todayRange.end },
        status: { in: ["LATE", "ABSENT", "EXCUSED"] },
        user: PERSON_WHERE
      },
      include: { user: { select: { id: true, name: true, employeeNumber: true, photoUrl: true } } },
      orderBy: [{ status: "asc" }, { minutesLate: "desc" }]
    }),
    prisma.pending.findMany({
      where: {
        storeId,
        status: { not: "COMPLETADO" },
        priority: { in: ["ALTA", "CRITICA"] }
      },
      include: { owner: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 6
    }),
    prisma.pending.count({
      where: {
        storeId,
        status: { not: "COMPLETADO" },
        priority: { in: ["ALTA", "CRITICA"] }
      }
    }),
    prisma.shiftRequest.count({ where: { storeId, status: "PENDIENTE" } }),
    prisma.inventoryRound.count({ where: { storeId, closedAt: null } }),
    prisma.weeklyPerformanceClose.findMany({
      where: { storeId, weekEnd: { lt: todayRange.start } },
      select: {
        id: true,
        weekStart: true,
        weekEnd: true,
        weekNumber: true,
        status: true,
        quotaSavedAt: true,
        reportSavedAt: true,
        finalizedAt: true
      },
      orderBy: { weekEnd: "desc" },
      take: 8
    }),
    prisma.kpi.aggregate({
      where: { storeId, user: PERSON_WHERE },
      _max: { date: true }
    })
  ]);

  if (!store) return NextResponse.json({ error: "Tienda no encontrada." }, { status: 404 });

  const storeTraffic = todayRows.reduce<number | null>((max, row) => {
    if (row.traffic === null) return max;
    return max === null ? row.traffic : Math.max(max, row.traffic);
  }, null);
  const todayMetric = buildManagerDashboardMetric({
    sales: todayRows.reduce((total, row) => total + number(row.dailySales), 0),
    goal: todayRows.reduce((total, row) => total + number(row.dailyGoal), 0),
    transactions: todayRows.reduce((total, row) => total + row.transactions, 0),
    pieces: todayRows.reduce((total, row) => total + row.pieces, 0),
    traffic: storeTraffic
  });
  const monthMetric = buildManagerDashboardMetric({
    sales: number(monthTotals._sum.dailySales),
    goal: number(monthTotals._sum.dailyGoal),
    transactions: monthTotals._sum.transactions ?? 0,
    pieces: monthTotals._sum.pieces ?? 0,
    traffic: null
  });

  const scheduleByUser = new Map(schedules.map((row) => [row.userId, row]));
  const kpiByUser = new Map(todayRows.map((row) => [row.userId, row]));
  const photoByUser = new Map(
    await Promise.all(
      [...new Map(
        [...advisors, ...attendance.map((row) => row.user)]
          .map((user) => [user.id, user] as const)
      ).values()].map(async (user) => [user.id, await signR2Url(user.photoUrl)] as const)
    )
  );
  const ranking = advisors
    .map((advisor) => {
      const kpi = kpiByUser.get(advisor.id);
      const schedule = scheduleByUser.get(advisor.id);
      const sales = number(kpi?.dailySales);
      const goal = number(kpi?.dailyGoal);
      return {
        userId: advisor.id,
        name: advisor.name,
        employeeNumber: advisor.employeeNumber,
        photoUrl: photoByUser.get(advisor.id) ?? null,
        sales,
        goal,
        achievement: goal > 0 ? Math.round((sales / goal) * 10_000) / 100 : null,
        scheduleStatus: schedule?.status ?? null,
        startTime: schedule?.startTime ?? null,
        endTime: schedule?.endTime ?? null
      };
    })
    .sort((left, right) => (right.achievement ?? -1) - (left.achievement ?? -1) || right.sales - left.sales);

  const workingToday = schedules.filter((row) => row.status === "WORKING" || row.status === "INVENTORY").length;
  const latestKpiDate = maybeDateKey(latestKpi._max.date);
  const advisorsWorkingWithoutGoal = ranking.filter((row) =>
    (row.scheduleStatus === "WORKING" || row.scheduleStatus === "INVENTORY") && row.goal <= 0
  ).length;
  const weeklyPerformanceActions = buildWeeklyPerformanceActions(weeklyPerformanceCloses);
  const periods = buildAgentPeriods({
    rows: periodRows,
    today: todayRange.start,
    weekStart: selectedWeek.weekStart,
    weekEnd: selectedWeek.weekEnd,
    retailMonthStart: selectedRetailMonth.start,
    retailMonthEnd: selectedRetailMonth.end,
    previousWeekStart,
    previousWeekEnd,
    previousMonthStart: previousMonth.start,
    previousMonthEnd: previousMonth.end,
    beforePreviousMonthStart: beforePreviousMonth.start,
    beforePreviousMonthEnd: beforePreviousMonth.end
  });
  const storeAudit = buildStoreAudit({
    generatedAt: new Date(),
    store,
    today: todayMetric,
    month: monthMetric,
    /*
     * ⚠️ El ritmo va con el ACUMULADO y su meta acumulada, no con la meta del
     * mes entero. `periods.month.toDate` ya trae las dos cosas y los días
     * transcurridos, que es lo que evita afirmar atraso el día 2 de un mes
     * retail de treinta y cinco.
     */
    monthPace: {
      salesToDate: periods.month.toDate.metric.sales,
      goalToDate: periods.month.toDate.metric.goal,
      elapsedDays: periods.month.toDate.elapsedDays,
      totalDays: periods.month.toDate.totalDays,
      capturedDays: periods.month.toDate.capturedDays
    },
    latestKpiDate,
    daysSinceKpi: latestKpiDate ? daysBetween(latestKpiDate, today) : null,
    /*
     * ⚠️ **Filas CAPTURADAS, no filas.** Guardar Cuota Justa crea la fila de
     * cada persona para toda la semana con la meta puesta y la venta en cero.
     * Contarlas hacía dos cosas mal a la vez: «Sin KPIs capturados hoy» no
     * saltaba nunca, y en su lugar saltaba «Venta diaria muy por debajo» —
     * crítica— sobre un día que simplemente aún no se había capturado.
     */
    todayKpiRows: todayRows.filter(tieneCaptura).length,
    activeAdvisors: advisors.length,
    workingToday,
    attendanceIssues: attendance.length,
    highPriorityPendings,
    pendingShiftRequests: pendingRequests,
    openInventoryRounds,
    weeklyPerformanceActions,
    advisorsWorkingWithoutGoal
  });
  const agent = buildStoreAgent({
    generatedAt: new Date(),
    primary: periods.primary,
    week: periods.week,
    monthContext: periods.monthContext,
    attention: storeAudit.anomalies.flatMap((item, index) => {
      if (!item.action) return [];
      return [{
        id: stableActionId(item.source, item.title, index),
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        source: item.source,
        route: item.action.route,
        label: item.action.label,
        count: item.count,
        status: item.action.status,
        period: item.action.period
      }];
    })
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    store,
    date: today,
    retailMonth: { start: periodDateKey(selectedRetailMonth.start), end: periodDateKey(selectedRetailMonth.end) },
    today: todayMetric,
    month: monthMetric,
    team: {
      activeAdvisors: advisors.length,
      workingToday,
      attendanceIssues: attendance.length,
      pendingRequests
    },
    agent,
    storeAudit,
    ranking,
    attention: {
      attendance: attendance.map((row) => ({
        userId: row.userId,
        name: row.user.name,
        employeeNumber: row.user.employeeNumber,
        photoUrl: photoByUser.get(row.userId) ?? null,
        status: row.status,
        expectedAt: row.expectedAt,
        arrivedAt: row.arrivedAt,
        minutesLate: row.minutesLate
      })),
      pendings: pendings.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        status: row.status,
        dueDate: dateKey(row.dueDate),
        ownerName: row.owner.name,
        overdue: row.dueDate < todayRange.start
      }))
    }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
