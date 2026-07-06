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

  // El corte de "últimas N semanas" se calcula sobre la semana retail
  // NORMALIZADA (domingo), no sobre weekStart crudo: hay filas históricas con
  // weekStart guardado por día y esos valores consumían el límite dejando
  // semanas partidas (la 26 aparecía solo con sus últimos días).
  const weekStarts = await prisma.kpi.findMany({
    where: { storeId: session.storeId, ...userFilter, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null } },
    distinct: ["weekStart"],
    select: { weekStart: true },
    orderBy: { weekStart: "desc" },
    take: 400
  });
  const sundays = Array.from(new Set(
    weekStarts.flatMap((row) => row.weekStart ? [sundayKey(row.weekStart)] : [])
  )).sort((a, b) => b.localeCompare(a));
  const oldestKey = sundays[Math.min(weeksLimit, sundays.length) - 1];
  if (!oldestKey) return NextResponse.json({ weeks: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const oldest = new Date(`${oldestKey}T00:00:00.000Z`);

  const rows = await prisma.kpi.findMany({
    where: { storeId: session.storeId, ...userFilter, weekNumber: { not: null }, weekStart: { gte: oldest } },
    include: { user: { select: { name: true, role: true, photoUrl: true } } },
    orderBy: [{ date: "asc" }, { userId: "asc" }]
  });

  const weeks = buildWeekHistory(rows, manager ? null : session.userId);
  return NextResponse.json({ weeks }, { headers: { "Cache-Control": "private, no-store" } });
}

// Domingo (inicio de semana retail) de una fecha, en clave YYYY-MM-DD.
function sundayKey(date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}
