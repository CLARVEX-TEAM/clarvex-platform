import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dateKey, endOfWeek, parseWeekStart } from "@/lib/schedule-week";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const weekStart = parseWeekStart(request.nextUrl.searchParams.get("weekStart"));
  if (!weekStart) return NextResponse.json({ error: "weekStart debe ser un domingo en formato YYYY-MM-DD." }, { status: 400 });

  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const userId = manager ? requestedUserId || undefined : session.userId;

  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, storeId: session.storeId }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Usuario no disponible en esta tienda." }, { status: 404 });
  }

  const [schedules, availableWeeks] = await Promise.all([
    prisma.schedule.findMany({
      where: {
        storeId: session.storeId,
        ...(userId ? { userId } : {}),
        date: { gte: weekStart, lte: endOfWeek(weekStart) }
      },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: [{ date: "asc" }, { user: { name: "asc" } }]
    }),
    prisma.schedule.findMany({
      where: { storeId: session.storeId, ...(userId ? { userId } : {}) },
      distinct: ["weekStart"],
      select: { weekStart: true },
      orderBy: { weekStart: "desc" }
    })
  ]);

  return NextResponse.json({
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(endOfWeek(weekStart)),
    availableWeeks: availableWeeks.map((item) => dateKey(item.weekStart)),
    schedules: schedules.map((schedule) => ({
      id: schedule.id,
      userId: schedule.userId,
      userName: schedule.user.name,
      userRole: schedule.user.role,
      date: dateKey(schedule.date),
      day: schedule.day,
      status: schedule.status,
      statusRaw: schedule.statusRaw,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      zone: schedule.zone
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
