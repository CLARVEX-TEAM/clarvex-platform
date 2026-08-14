import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** La asistencia ya se captura en Retool; la hoja APERTURA dejó de ser fuente. */
export async function POST(request: Request) {
  const unauthorized = requireCron(request);
  if (unauthorized) return unauthorized;
  return NextResponse.json({ ok: true, disabled: true, sources: 0, reason: "Captura propia activa." });
}
