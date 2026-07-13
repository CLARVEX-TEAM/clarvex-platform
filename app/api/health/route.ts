import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkR2Health } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = "ok" | "fail" | "skip";

// Chequeo crítico y barato: la BD es la dependencia sin la cual nada funciona.
async function checkDb(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "fail";
  }
}

// Health-check para Uptime Kuma y monitoreo externo. Público (sin sesión) para
// que el monitor lo consulte, pero solo expone booleanos de estado, sin datos.
//
// - Por defecto: solo BD (rápido, seguro de poll cada minuto).
// - `?deep=1` con `Authorization: Bearer <CRON_SECRET>`: además verifica R2
//   (HeadBucket). Se protege con token para no exponer un vector de abuso
//   contra servicios externos desde un endpoint público.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deepRequested = searchParams.get("deep") === "1";
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const deepAllowed = deepRequested && Boolean(secret) && header === `Bearer ${secret}`;

  const checks: Record<string, CheckResult> = {
    db: await checkDb(),
    r2: deepAllowed ? ((await checkR2Health()) ? "ok" : "fail") : "skip"
  };

  const healthy = !Object.values(checks).includes("fail");
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
