import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { syncAllSources } from "@/lib/data-source-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sincronización secuencial de múltiples fuentes: puede tardar varios minutos.
export const maxDuration = 300;

export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;

  const result = await syncAllSources();
  return NextResponse.json(result);
}
