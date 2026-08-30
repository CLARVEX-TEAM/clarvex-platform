import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";
import { buildManagerDashboardMetric } from "@/lib/retool-manager-dashboard";
import { buildStoreAudit } from "@/lib/retool-store-audit";
import {
  addDays,
  buildAgentPeriods,
  buildStoreAgent,
  buildWeeklyPerformanceActions
} from "@/lib/retool-store-agent";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";
import { reconstructRdvWeek } from "@/lib/rdv-week";
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

function stableActionId(source: string, title: string, index: number): string {
  return `${source}-${title}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  const retailMonth = retailMonthBoundsFor(todayRange.start);
  const retailWeek = reconstructRdvWeek(todayRange.start);
  const previousWeekStart = addDays(retailWeek.weekStart, -7);
  const previousWeekEnd = addDays(retailWeek.weekStart, -1);
  const previousMonth = retailMonthBoundsFor(addDays(retailMonth.start, -1));
  const beforePreviousMonth = retailMonthBoundsFor(addDays(previousMonth.start, -1));
  const contextStart = minDate(beforePreviousMonth.start, previousWeekStart);

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
      where: { storeId, date: { gte: retailMonth.start, lt: todayRange.end }, user: PERSON_WHERE },
      _sum: { dailySales: true, dailyGoal: true, transactions: true, pieces: true }
    }),
    prisma.kpi.findMany({
      where: { storeId, date: { gte: contextStart, lt: todayRange.end }, user: PERSON_WHERE },
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
    todayEnd: addDays(todayRange.end, -1),
    weekStart: retailWeek.weekStart,
    retailMonthStart: retailMonth.start,
    retailMonthEnd: retailMonth.end,
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
    latestKpiDate,
    daysSinceKpi: latestKpiDate ? daysBetween(latestKpiDate, today) : null,
    todayKpiRows: todayRows.length,
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
    retailMonth: { start: dateKey(retailMonth.start), end: dateKey(retailMonth.end) },
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
