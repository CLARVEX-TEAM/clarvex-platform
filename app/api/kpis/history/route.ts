import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { buildWeekHistory } from "@/lib/kpi-history";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Histórico por semana retail: gerencia ve totales de tienda, asesor lo suyo.
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const userFilter = manager ? {} : { userId: session.userId };
  const weeksParam = Number(request.nextUrl.searchParams.get("weeks") ?? "12");
  const weeksLimit = Number.isFinite(weeksParam) ? Math.min(26, Math.max(4, Math.trunc(weeksParam))) : 12;

  const weekStarts = await prisma.kpi.findMany({
    where: { storeId: session.storeId, ...userFilter, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null } },
    distinct: ["weekStart"],
    select: { weekStart: true },
    orderBy: { weekStart: "desc" },
    take: weeksLimit
  });
  const oldest = weekStarts.at(-1)?.weekStart;
  if (!oldest) return NextResponse.json({ weeks: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const rows = await prisma.kpi.findMany({
    where: { storeId: session.storeId, ...userFilter, weekNumber: { not: null }, weekStart: { gte: oldest } },
    include: { user: { select: { name: true, role: true, photoUrl: true } } },
    orderBy: [{ date: "asc" }, { userId: "asc" }]
  });

  const weeks = buildWeekHistory(rows, manager ? null : session.userId);
  return NextResponse.json({ weeks }, { headers: { "Cache-Control": "private, no-store" } });
}
