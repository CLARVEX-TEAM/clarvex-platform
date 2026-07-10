import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { parsePeriodDate, type KpiPeriod } from "@/lib/kpi-period";
import { getKpiReport } from "@/lib/services/kpi-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const periodParam = request.nextUrl.searchParams.get("period") ?? "week";
  if (periodParam !== "week" && periodParam !== "month") return NextResponse.json({ error: "period debe ser week o month." }, { status: 400 });
  const period = periodParam as KpiPeriod;
  const selectedDate = parsePeriodDate(request.nextUrl.searchParams.get("date"));
  if (!selectedDate) return NextResponse.json({ error: "date debe usar formato YYYY-MM-DD." }, { status: 400 });

  const report = await getKpiReport(session, { period, selectedDate });
  return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
}
