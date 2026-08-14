import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Las fuentes heredadas ya no se sincronizan: Retool escribe mediante captura. */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true, disabled: true, sources: 0, reason: "Captura propia activa." });
}
