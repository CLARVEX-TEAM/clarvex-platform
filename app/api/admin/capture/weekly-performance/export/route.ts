import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { getWeeklyPerformance } from "@/lib/weekly-performance";
import { buildWeeklyPerformanceWorkbook } from "@/lib/weekly-performance-xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId") ?? "";
  const reportWeekStart = parseDay(params.get("reportWeekStart") ?? params.get("weekStart"));
  const quotaWeekStart = parseDay(params.get("quotaWeekStart")) ?? nextWeek(reportWeekStart);
  if (!storeId || !reportWeekStart || !quotaWeekStart) return NextResponse.json({ error: "Tienda o semanas inválidas." }, { status: 400 });
  try {
    const state = await getWeeklyPerformance(storeId, reportWeekStart, quotaWeekStart);
    const buffer = await buildWeeklyPerformanceWorkbook(state);
    const filename = `CUOTA-JUSTA-S${state.quotaWeek.weekNumber}-RDS-S${state.reportWeek.weekNumber}.xlsx`;
    if (params.get("format") === "base64") {
      return NextResponse.json({
        ok: true, filename,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: buffer.toString("base64")
      });
    }
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo exportar el cierre." }, { status: 422 });
  }
}

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function nextWeek(value: Date | null) { return value ? new Date(value.getTime() + 7 * 86_400_000) : null; }
