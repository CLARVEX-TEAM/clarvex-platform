import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { aggregateKpis, aggregateStore } from "@/lib/kpi-report";
import { getKpiMonthRange, parsePeriodDate, periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
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
  const [availableWeekRows, legacyWeekRows] = await Promise.all([
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
    })
  ]);
  const persistedWeeks = availableWeekRows.flatMap((week) => week.weekNumber !== null && week.weekStart && week.weekEnd ? [{ weekNumber: week.weekNumber, weekStart: week.weekStart, weekEnd: week.weekEnd }] : []);
  const availableWeeks = mergeRdvWeeks(persistedWeeks, legacyWeekRows.map((row) => row.date));
  const selectedWeek = period === "week" ? selectRdvWeek(availableWeeks, selectedDate) : null;
  const calendarRange = getKpiMonthRange(selectedDate);
  const start = selectedWeek?.weekStart ?? calendarRange.start;
  const end = selectedWeek?.weekEnd ?? calendarRange.end;

  const [rows, rules] = await Promise.all([
    prisma.kpi.findMany({
      where: {
        storeId: session.storeId,
        ...userFilter,
        ...(period === "week" && selectedWeek
          ? { OR: [
              { weekNumber: selectedWeek.weekNumber, weekStart: selectedWeek.weekStart },
              { date: { gte: selectedWeek.weekStart, lte: selectedWeek.weekEnd } }
            ] }
          : period === "week"
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

  const reports = aggregateKpis(rows);
  const team = reports.filter((item) => item.role === "ASESOR");
  const own = reports.find((item) => item.userId === session.userId) ?? null;
  const store = manager ? aggregateStore(team.length ? team : reports) : null;
  console.log("Consulta KPI por periodo", {
    period,
    weekNumber: selectedWeek?.weekNumber ?? null,
    weekStart: selectedWeek ? periodDateKey(selectedWeek.weekStart) : null,
    weekEnd: selectedWeek ? periodDateKey(selectedWeek.weekEnd) : null,
    fechasIncluidas: Array.from(new Set(rows.map((row) => periodDateKey(row.date)))),
    ventaAcumulada: reports.reduce((total, item) => total + item.sales, 0),
    metaAcumulada: reports.reduce((total, item) => total + item.goal, 0)
  });

  return NextResponse.json({
    period,
    selectedDate: periodDateKey(selectedDate),
    startDate: periodDateKey(start),
    endDate: periodDateKey(end),
    weekNumber: selectedWeek?.weekNumber ?? null,
    availableWeeks: availableWeeks.map((week) => ({ weekNumber: week.weekNumber, weekStart: periodDateKey(week.weekStart), weekEnd: periodDateKey(week.weekEnd) })),
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

function selectRdvWeek(weeks: Array<{ weekNumber: number; weekStart: Date; weekEnd: Date }>, selectedDate: Date) {
  return weeks.find((week) => week.weekStart.getTime() === selectedDate.getTime())
    ?? weeks.find((week) => selectedDate >= week.weekStart && selectedDate <= week.weekEnd)
    ?? weeks[0]
    ?? null;
}
