import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// In-memory rate limiter: 10 req/min per IP
const rateLimit = new Map<string, { count: number; resetAt: number }>();
let cleanupCounter = 0;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Periodic cleanup to prevent unbounded map growth
  if (++cleanupCounter % 50 === 0) {
    Array.from(rateLimit.entries()).forEach(([key, entry]) => {
      if (entry.resetAt < now) rateLimit.delete(key);
    });
  }
  const entry = rateLimit.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> }
) {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en un minuto." },
      { status: 429 }
    );
  }

  const { employeeNumber } = await params;
  if (!employeeNumber || !/^\d+$/.test(employeeNumber)) {
    return NextResponse.json({ error: "Número de empleado inválido." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { employeeNumber },
        { employeeNumberAliases: { some: { employeeNumber } } },
      ],
    },
    select: {
      id: true,
      name: true,
      role: true,
      photoUrl: true,
      store: { select: { name: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });
  }

  // Buscar KPI del día actual
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const kpi = await prisma.kpi.findFirst({
    where: { userId: user.id, date: { gte: today, lt: tomorrow } },
    select: { dailySales: true, dailyGoal: true, conversion: true },
  });

  const ventaHoy = kpi ? Number(kpi.dailySales) : 0;
  const metaHoy = kpi ? Number(kpi.dailyGoal) : 0;
  const alcanceHoy =
    metaHoy > 0 ? Math.round((ventaHoy / metaHoy) * 100) : 0;
  const conversion = kpi?.conversion !== null && kpi?.conversion !== undefined
    ? Number(kpi.conversion)
    : 0;

  return NextResponse.json(
    {
      name: user.name,
      role: user.role,
      photo: user.photoUrl ?? null,
      store: user.store.name,
      kpis: { ventaHoy, metaHoy, alcanceHoy, conversion },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
