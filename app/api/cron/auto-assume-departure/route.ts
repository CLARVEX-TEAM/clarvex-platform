import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { autoAssumeDepartureAllStores } from "@/lib/auto-assume-departure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron: auto-asume la salida de quien marcó entrada pero no salida a las 10:00 PM.
 * Regla de la tienda: sin salida marcada = salió a su hora esperada.
 */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const results = await autoAssumeDepartureAllStores();
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const totalErrors = results.flatMap((r) => r.errors);

  return NextResponse.json({
    ok: totalErrors.length === 0,
    updated: totalUpdated,
    errors: totalErrors,
    stores: results
  });
}
