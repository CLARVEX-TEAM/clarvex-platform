import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedDemoStore } from "@/lib/demo-seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/demo-refresh  (Authorization: Bearer <CRON_SECRET>)
 *
 * Re-siembra la tienda demo con la fecha de HOY para que el demo nunca salga
 * vacío. Idempotente y aislado a `demo-showcase`. Pensado para un cron diario.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  await seedDemoStore(prisma);
  return NextResponse.json({ ok: true, store: "demo-showcase" });
}
