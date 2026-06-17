import { NextResponse } from "next/server";
import { syncAllSources } from "@/lib/data-source-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sincronización secuencial de múltiples fuentes: puede tardar varios minutos.
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const result = await syncAllSources();
  return NextResponse.json(result);
}
