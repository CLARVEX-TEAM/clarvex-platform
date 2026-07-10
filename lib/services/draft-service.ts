import { PendingCategory, PendingPriority } from "@prisma/client";
import { parsePeriodDate } from "@/lib/kpi-period";
import { prisma } from "@/lib/prisma";
import { getKpiReport, getStoreDailyResults } from "@/lib/services/kpi-service";
import { getOpenPendings } from "@/lib/services/pending-service";
import { getSchedules } from "@/lib/services/schedule-service";
import type { Session } from "@/lib/session-token";

// Contexto (SOLO LECTURA) para que el modelo REDACTE borradores en Fase 2.
// Estos servicios nunca escriben: reúnen datos ya calculados y aislados por
// tienda/rol; el borrador lo compone el modelo y lo publica el usuario por las
// vías validadas existentes.

// Comunicado: rendimiento del día + pendientes + últimos comunicados (para
// evitar duplicados y dar contexto relevante).
export async function getAnnouncementContext(session: Session, topic: string) {
  const [todayResults, openPendings, recent] = await Promise.all([
    getStoreDailyResults(session),
    getOpenPendings(session, { limit: 5 }),
    prisma.announcement.findMany({
      where: { storeId: session.storeId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { title: true, createdAt: true }
    })
  ]);
  return {
    topic,
    todayResults,
    openPendings,
    recentAnnouncements: recent.map((item) => ({ title: item.title, date: item.createdAt.toISOString().slice(0, 10) }))
  };
}

// Plan del día para un asesor: su desempeño de la semana + sus pendientes +
// su horario. Valida que el colaborador pertenezca a la tienda.
export async function getDailyPlanContext(session: Session, userId: string) {
  const report = await getKpiReport(session, { period: "week", selectedDate: parsePeriodDate(null) as Date });
  const advisor = report.team.find((item) => item.userId === userId) ?? (report.own?.userId === userId ? report.own : null);
  if (!advisor) return null;

  const [pendings, schedule] = await Promise.all([
    prisma.pending.findMany({
      where: { storeId: session.storeId, ownerId: userId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5,
      select: { title: true, priority: true, dueDate: true }
    }),
    getSchedules(session, { userId })
  ]);

  return {
    advisor: {
      userId: advisor.userId,
      name: advisor.userName,
      sales: advisor.sales,
      goal: advisor.goal,
      achievement: advisor.achievement,
      upt: advisor.upt,
      conversion: advisor.conversion,
      ranking: advisor.ranking
    },
    pendings: pendings.map((item) => ({ title: item.title, priority: item.priority, dueDate: item.dueDate.toISOString().slice(0, 10) })),
    schedule: schedule.schedules
  };
}

// Pendiente/tarea: catálogos válidos (para que el borrador use enums correctos)
// + pendientes actuales (para evitar duplicados).
export async function getPendingDraftContext(session: Session, topic: string) {
  const openPendings = await getOpenPendings(session, { limit: 10 });
  return {
    topic,
    categories: Object.values(PendingCategory),
    priorities: Object.values(PendingPriority),
    openPendings
  };
}
