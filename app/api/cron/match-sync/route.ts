import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { findSyncableMatch, syncLinkedMatch } from "@/lib/match-sync";
import { serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/cron/match-sync — respaldo para cuando nadie tiene la app abierta:
// el sync en vivo lo hace /api/match/active con cada visita del banner.
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const match = await findSyncableMatch();
  if (!match) {
    return NextResponse.json({ skipped: true, reason: "Sin partido activo vinculado" });
  }

  let result;
  try {
    result = await syncLinkedMatch(match);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  if (result.skipped) {
    return NextResponse.json(result.reason === "Sin cambios" ? { ok: true, unchanged: true } : { skipped: true, reason: result.reason });
  }

  return NextResponse.json({
    ok: true,
    match: serializeMatch(result.updated),
    mxGoals: result.mxGoals,
    rivalGoals: result.rivalGoals,
    statusChange: result.statusChange
  });
}
