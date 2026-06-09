import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { decodeSyncLogMessage, type KpiSyncMetrics } from "@/lib/data-source";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic } from "@/lib/kpi-report";
import { buildRetailMonths, parsePeriodDate, periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
import { prisma } from "@/lib/prisma";
import { mergeRdvWeeks } from "@/lib/rdv-week";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const periodParam = request.nextUrl.searchParams.get("period") ?? "week";
  if (periodParam !== "week" && periodParam !== "month") return NextResponse.json({ error: "period debe ser week o month." }, { status: 400 });
  const period = periodParam as KpiPeriod;
  const selectedDate = parsePeriodDate(request.nextUrl.searchParams.get("date"));
  if (!selectedDate) return NextResponse.json({ error: "date debe usar formato YYYY-MM-DD." }, { status: 400 });
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const userFilter = manager ? {} : { userId: session.userId };
  const [availableWeekRows, legacyWeekRows, latestKpiSource] = await Promise.all([
    prisma.kpi.findMany({
      where: { storeId: session.storeId, ...userFilter, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null } },
      distinct: ["weekStart", "weekNumber"],
      select: { weekNumber: true, weekStart: true, weekEnd: true },
      orderBy: { weekStart: "desc" }
    }),
    prisma.kpi.findMany({
      where: { storeId: session.storeId, ...userFilter, OR: [{ weekNumber: null }, { weekStart: null }, { weekEnd: null }] },
      distinct: ["date"],
      select: { date: true },
      orderBy: { date: "desc" }
    }),
    prisma.dataSource.findFirst({
      where: { storeId: session.storeId, type: "KPIS" },
      include: { syncLogs: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 1 } }
    })
  ]);
  const persistedWeeks = availableWeekRows.flatMap((week) => week.weekNumber !== null && week.weekStart && week.weekEnd ? [{ weekNumber: week.weekNumber, weekStart: week.weekStart, weekEnd: week.weekEnd }] : []);
  const latestDetails = latestKpiSource?.syncLogs[0] ? decodeSyncLogMessage(latestKpiSource.syncLogs[0].message).details : null;
  const syncedWeeks = isKpiSyncMetrics(latestDetails) ? latestDetails.weeksDetected.map((week) => ({
    weekNumber: week.weekNumber,
    weekStart: new Date(`${week.weekStart}T00:00:00.000Z`),
    weekEnd: new Date(`${week.weekEnd}T00:00:00.000Z`)
  })) : [];
  const availableWeeks = mergeRdvWeeks([...persistedWeeks, ...syncedWeeks], legacyWeekRows.map((row) => row.date))
    .sort((left, right) => left.weekStart.getTime() - right.weekStart.getTime());
  const selectedWeek = period === "week" ? selectRdvWeek(availableWeeks, selectedDate) : null;
  const retailMonths = buildRetailMonths(availableWeeks);
  const selectedRetailMonth = selectRetailMonth(retailMonths, selectedDate);
  const start = selectedWeek?.weekStart ?? selectedRetailMonth?.start ?? selectedDate;
  const end = selectedWeek?.weekEnd ?? selectedRetailMonth?.end ?? selectedDate;

  const [rows, rules] = await Promise.all([
    prisma.kpi.findMany({
      where: {
        storeId: session.storeId,
        ...userFilter,
        ...(period === "week" && !selectedWeek
          ? { id: "__missing_rdv_week__" }
          : { date: { gte: start, lte: end } })
      },
      include: { user: { select: { name: true, role: true, photoUrl: true } } },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    }),
    prisma.commissionRule.findMany({
      where: { storeId: session.storeId, ...(manager ? {} : { OR: [{ role: session.role }, { role: null }] }) },
      orderBy: [{ active: "desc" }, { role: "asc" }, { minAchievement: "asc" }]
    })
  ]);

  const advisorUserIds = Array.from(new Set(rows.filter((row) => row.user.role === "ASESOR").map((row) => row.userId)));
  const schedules = advisorUserIds.length ? await prisma.schedule.findMany({
    where: { storeId: session.storeId, userId: { in: advisorUserIds }, date: { gte: start, lte: end } },
    select: { userId: true, date: true, status: true, statusRaw: true }
  }) : [];
  const workingKeys = buildWorkingScheduleKeys(schedules);
  const individualRows = rows;
  const reports = aggregateKpis(individualRows);
  const storeReports = aggregateKpis(rows);
  const team = reports
    .filter((item) => item.role === "ASESOR")
    .sort((a, b) => b.sales - a.sales || b.achievement - a.achievement);
  team.forEach((item, index) => { item.ranking = index + 1; });
  const own = reports.find((item) => item.userId === session.userId) ?? null;
  const kpiTtls = isKpiSyncMetrics(latestDetails) && "ttlsMeta" in latestDetails ? latestDetails as KpiSyncMetrics : null;
  const ttlsGoalOverride = kpiTtls?.ttlsMeta && kpiTtls.ttlsMeta > 0 ? kpiTtls.ttlsMeta : undefined;
  const computedTraffic = aggregateStoreTraffic(rows);
  const trafficForStore = computedTraffic ?? (kpiTtls?.ttlsTraffic ?? null);
  const store = manager ? aggregateStore(storeReports, trafficForStore, ttlsGoalOverride) : null;
  const workedDays = session.role === "ASESOR"
    ? Array.from(workingKeys).filter((key) => key.startsWith(`${session.userId}:`)).length
    : null;

  return NextResponse.json({
    period,
    selectedDate: periodDateKey(selectedDate),
    startDate: periodDateKey(start),
    endDate: periodDateKey(end),
    weekNumber: selectedWeek?.weekNumber ?? null,
    availableWeeks: availableWeeks.map((week) => ({ weekNumber: week.weekNumber, weekStart: periodDateKey(week.weekStart), weekEnd: periodDateKey(week.weekEnd) })),
    availableRetailMonths: retailMonths.map((month) => ({ label: month.label, start: periodDateKey(month.start), end: periodDateKey(month.end) })),
    retailMonthLabel: selectedRetailMonth?.label ?? null,
    workedDays,
    currentUserId: session.userId,
    role: session.role,
    store,
    own,
    team: manager ? team : own ? [own] : [],
    commissionRules: rules.map((rule) => ({
      id: rule.id, storeId: rule.storeId, role: rule.role,
      minSales: Number(rule.minSales), maxSales: rule.maxSales === null ? null : Number(rule.maxSales),
      minAchievement: Number(rule.minAchievement), maxAchievement: rule.maxAchievement === null ? null : Number(rule.maxAchievement),
      commissionPercent: Number(rule.commissionPercent), active: rule.active
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

function isKpiSyncMetrics(details: unknown): details is KpiSyncMetrics {
  return typeof details === "object" && details !== null && "sheetUsed" in details && "weeksDetected" in details && Array.isArray((details as KpiSyncMetrics).weeksDetected);
}

function selectRetailMonth(months: Array<{ label: string; start: Date; end: Date }>, selectedDate: Date) {
  return months.find((month) => selectedDate >= month.start && selectedDate <= month.end)
    ?? months.find((month) => month.end.getUTCFullYear() === selectedDate.getUTCFullYear() && month.end.getUTCMonth() === selectedDate.getUTCMonth())
    ?? months.at(-1)
    ?? null;
}

function buildWorkingScheduleKeys(schedules: Array<{ userId: string; date: Date; status: string; statusRaw: string | null }>) {
  const byUserDate = new Map<string, { status: string; quality: number }>();
  for (const schedule of schedules) {
    const key = `${schedule.userId}:${periodDateKey(schedule.date)}`;
    const quality = (schedule.statusRaw ? 2 : 0) + (schedule.date.getUTCHours() === 0 ? 1 : 0);
    if (!byUserDate.has(key) || quality > byUserDate.get(key)!.quality) byUserDate.set(key, { status: schedule.status, quality });
  }
  return new Set(Array.from(byUserDate.entries()).filter(([, schedule]) => schedule.status === "WORKING").map(([key]) => key));
}

function selectRdvWeek(weeks: Array<{ weekNumber: number; weekStart: Date; weekEnd: Date }>, selectedDate: Date) {
  return weeks.find((week) => week.weekStart.getTime() === selectedDate.getTime())
    ?? weeks.find((week) => selectedDate >= week.weekStart && selectedDate <= week.weekEnd)
    ?? weeks[0]
    ?? null;
}
