import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildWeeklySchedule } from "@/lib/schedule-report";
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

  const [users, schedules, availableWeeks] = await Promise.all([
    prisma.user.findMany({
      // Sin el usuario "kiosko" (checklistOnly): es el celular del cierre, no un
      // integrante con turno. Salía como "Sin horario" en toda la semana.
      where: { storeId: session.storeId, active: true, checklistOnly: false, ...(userId ? { id: userId } : {}) },
      select: { id: true, name: true, role: true, photoUrl: true },
      orderBy: [{ role: "asc" }, { name: "asc" }]
    }),
    prisma.schedule.findMany({
      where: {
        storeId: session.storeId,
        ...(userId ? { userId } : {}),
        date: { gte: weekStart, lte: endOfWeek(weekStart) }
      },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    }),
    prisma.schedule.findMany({
      where: { storeId: session.storeId, ...(userId ? { userId } : {}) },
      distinct: ["weekStart"],
      select: { weekStart: true },
      orderBy: { weekStart: "desc" }
    })
  ]);
  const weekEnd = endOfWeek(weekStart);
  const weeklySchedule = buildWeeklySchedule(users, schedules, weekStart);


  return NextResponse.json({
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(weekEnd),
    availableWeeks: availableWeeks.map((item) => dateKey(item.weekStart)),
    schedules: weeklySchedule
  }, { headers: { "Cache-Control": "private, no-store" } });
}
