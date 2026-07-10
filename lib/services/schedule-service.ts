import { prisma } from "@/lib/prisma";
import { buildWeeklySchedule } from "@/lib/schedule-report";
import { dateKey, endOfWeek, startOfWeek } from "@/lib/schedule-week";
import type { Session } from "@/lib/session-token";

// Horarios de la semana (domingo–sábado) con aislamiento por tienda y rol.
// Reutiliza el mismo constructor que la pantalla /horarios y GET /api/schedules.
export type SchedulesParams = {
  weekStart?: Date;
  userId?: string;
};

export async function getSchedules(session: Session, params: SchedulesParams = {}) {
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const weekStart = params.weekStart ?? startOfWeek(new Date());
  // Un asesor solo puede consultar su propio horario; gerencia puede filtrar por
  // colaborador de SU tienda (validado abajo) o ver a todo el equipo.
  const requestedUserId = manager ? params.userId : session.userId;

  if (requestedUserId) {
    const user = await prisma.user.findFirst({ where: { id: requestedUserId, storeId: session.storeId }, select: { id: true } });
    if (!user) return { weekStart: dateKey(weekStart), weekEnd: dateKey(endOfWeek(weekStart)), schedules: [] as ReturnType<typeof buildWeeklySchedule> };
  }

  const [users, schedules] = await Promise.all([
    prisma.user.findMany({
      where: { storeId: session.storeId, active: true, ...(requestedUserId ? { id: requestedUserId } : {}) },
      select: { id: true, name: true, role: true, photoUrl: true },
      orderBy: [{ role: "asc" }, { name: "asc" }]
    }),
    prisma.schedule.findMany({
      where: { storeId: session.storeId, ...(requestedUserId ? { userId: requestedUserId } : {}), date: { gte: weekStart, lte: endOfWeek(weekStart) } },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    })
  ]);

  return {
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(endOfWeek(weekStart)),
    schedules: buildWeeklySchedule(users, schedules, weekStart)
  };
}
