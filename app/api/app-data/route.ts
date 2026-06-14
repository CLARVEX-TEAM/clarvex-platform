import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { buildUserDashboardKpi, dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function lower(value: string) {
  return value.toLowerCase().replace("_", " ");
}

export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role !== "ASESOR";
  const own = manager ? {} : { userId: session.userId };
  const dashboardDate = dashboardDateKey();
  const dashboardRange = dashboardDateRange(dashboardDate);

  const [users, kpis, dashboardRows, plans, pendings, logEntries, announcements, schedules, evidences, commissionRules] = await Promise.all([
    prisma.user.findMany({ where: { storeId: session.storeId }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.kpi.findMany({ where: { storeId: session.storeId, ...own }, orderBy: [{ date: "desc" }, { ranking: "asc" }] }),
    prisma.kpi.findMany({
      // Gerencia: todas las filas del día (para el TOTAL de tienda). Asesor: solo la suya.
      where: {
        storeId: session.storeId,
        ...(manager ? {} : { userId: session.userId }),
        date: { gte: dashboardRange.start, lt: dashboardRange.end }
      },
      select: { dailyGoal: true, dailySales: true, transactions: true, pieces: true, traffic: true }
    }),
    prisma.dayPlan.findMany({ where: { storeId: session.storeId, ...own }, include: { activities: true }, orderBy: { date: "desc" } }),
    prisma.pending.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { ownerId: session.userId }) }, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] }),
    prisma.storeLog.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { authorId: session.userId }) }, orderBy: { createdAt: "asc" } }),
    prisma.announcement.findMany({ where: { storeId: session.storeId }, include: { reads: true, reactions: true }, orderBy: { createdAt: "desc" } }),
    prisma.schedule.findMany({ where: { storeId: session.storeId, ...own }, orderBy: [{ userId: "asc" }, { date: "asc" }] }),
    prisma.evidence.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { uploadedById: session.userId }) }, orderBy: { createdAt: "desc" } }),
    prisma.commissionRule.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { OR: [{ role: session.role }, { role: null }] }) }, orderBy: [{ active: "desc" }, { role: "asc" }, { minAchievement: "asc" }] })
  ]);
  // Gerencia: TOTAL de tienda del día (suma de colaboradores = TOTALES; meta de
  // gerente/subgerente = meta de tienda). Asesor: su única fila del día.
  const dashboardRow = dashboardRows.length === 0 ? null : {
    dailyGoal: dashboardRows.reduce((total, row) => total + Number(row.dailyGoal), 0),
    dailySales: dashboardRows.reduce((total, row) => total + Number(row.dailySales), 0),
    transactions: dashboardRows.reduce((total, row) => total + row.transactions, 0),
    pieces: dashboardRows.reduce((total, row) => total + row.pieces, 0),
    traffic: dashboardRows.reduce<number | null>((max, row) => row.traffic !== null && (max === null || row.traffic > max) ? row.traffic : max, null)
  };
  const dashboardDaily = buildUserDashboardKpi(dashboardDate, dashboardRow);


  return NextResponse.json({
    users: users.map((user) => ({ id: user.id, name: user.name, employeeNumber: user.employeeNumber, role: user.role, avatar: user.name.slice(0, 2).toUpperCase(), photoUrl: user.photoUrl, biometricEnabled: user.biometricEnabled, lastLoginAt: user.lastLoginAt?.toISOString() ?? null })),
    kpis: kpis.map((kpi) => ({ userId: kpi.userId, date: kpi.date.toISOString().slice(0, 10), dailySales: Number(kpi.dailySales), monthlySales: Number(kpi.monthlySales), dailyGoal: Number(kpi.dailyGoal), monthlyGoal: Number(kpi.monthlyGoal), avgTicket: Number(kpi.avgTicket), upt: Number(kpi.upt), conversion: kpi.conversion === null ? null : Number(kpi.conversion), traffic: kpi.traffic, pieces: kpi.pieces, transactions: kpi.transactions, ranking: kpi.ranking, grossSales: kpi.grossSales === null ? null : Number(kpi.grossSales), discountAmount: kpi.discountAmount === null ? null : Number(kpi.discountAmount), discountMargin: kpi.discountMargin === null ? null : Number(kpi.discountMargin), discountLimit: kpi.discountLimit === null ? null : Number(kpi.discountLimit), commissionAmount: Number(kpi.commissionAmount), commissionPercent: Number(kpi.commissionPercent) })),
    dashboardDaily,
    plans: plans.map((plan) => ({ id: plan.id, userId: plan.userId, date: plan.date.toISOString().slice(0, 10), dailyGoal: Number(plan.dailyGoal), focus: plan.focus, message: plan.message, activities: plan.activities.map((activity) => ({ id: activity.id, title: activity.title, completed: activity.completed })) })),
    pendings: pendings.map((pending) => ({ id: pending.id, title: pending.title, description: pending.description, category: lower(pending.category), priority: lower(pending.priority), ownerId: pending.ownerId, status: lower(pending.status), dueDate: pending.dueDate.toISOString().slice(0, 10) })),
    logEntries: logEntries.map((entry) => ({ id: entry.id, date: entry.createdAt.toISOString(), authorId: entry.authorId, category: entry.category, description: entry.description, evidenceUrl: entry.evidenceUrl })),
    announcements: announcements.map((announcement) => ({ id: announcement.id, title: announcement.title, body: announcement.body, imageUrl: announcement.imageUrl ?? null, authorId: announcement.authorId, date: announcement.createdAt.toISOString().slice(0, 10), readBy: announcement.reads.map((read) => read.userId), reactions: announcement.reactions.map((reaction) => ({ emoji: reaction.emoji, userId: reaction.userId })) })),
    schedules: schedules.map((shift) => ({ id: shift.id, userId: shift.userId, day: shift.day, start: shift.startTime ?? shift.statusRaw ?? shift.status, end: shift.endTime ?? "", zone: shift.zone ?? "" })),
    evidences: evidences.map((evidence) => ({ id: evidence.id, storeId: evidence.storeId, uploadedById: evidence.uploadedById, pendingId: evidence.pendingId, logEntryId: evidence.logEntryId, taskId: evidence.taskId, url: evidence.url, fileName: evidence.fileName, mimeType: evidence.mimeType, note: evidence.note, createdAt: evidence.createdAt.toISOString() })),
    commissionRules: commissionRules.map((rule) => ({ id: rule.id, storeId: rule.storeId, role: rule.role, minSales: Number(rule.minSales), maxSales: rule.maxSales === null ? null : Number(rule.maxSales), minAchievement: Number(rule.minAchievement), maxAchievement: rule.maxAchievement === null ? null : Number(rule.maxAchievement), commissionPercent: Number(rule.commissionPercent), active: rule.active }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
