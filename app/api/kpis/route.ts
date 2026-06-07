import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { aggregateKpis, aggregateStore } from "@/lib/kpi-report";
import { getKpiPeriodRange, parsePeriodDate, periodDateKey, type KpiPeriod } from "@/lib/kpi-period";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const periodParam = request.nextUrl.searchParams.get("period") ?? "week";
  if (periodParam !== "week" && periodParam !== "month") return NextResponse.json({ error: "period debe ser week o month." }, { status: 400 });
  const period = periodParam as KpiPeriod;
  const selectedDate = parsePeriodDate(request.nextUrl.searchParams.get("date"));
  if (!selectedDate) return NextResponse.json({ error: "date debe usar formato YYYY-MM-DD." }, { status: 400 });
  const { start, end } = getKpiPeriodRange(period, selectedDate);
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";

  const [rows, rules] = await Promise.all([
    prisma.kpi.findMany({
      where: { storeId: session.storeId, ...(manager ? {} : { userId: session.userId }), date: { gte: start, lte: end } },
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

  return NextResponse.json({
    period,
    selectedDate: periodDateKey(selectedDate),
    startDate: periodDateKey(start),
    endDate: periodDateKey(end),
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
