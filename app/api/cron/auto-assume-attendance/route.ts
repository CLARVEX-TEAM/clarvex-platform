import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { autoAssumeAttendanceAllStores } from "@/lib/auto-assume-attendance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron: auto-asume la asistencia de quien no capturó nada en Retool a la 1:00 PM.
 * Regla de la tienda: sin registro = llegó a tiempo.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const results = await autoAssumeAttendanceAllStores();
  const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
  const totalErrors = results.flatMap((r) => r.errors);

  return NextResponse.json({
    ok: totalErrors.length === 0,
    created: totalCreated,
    errors: totalErrors,
    stores: results
  });
}
