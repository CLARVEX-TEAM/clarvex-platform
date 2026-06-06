import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
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

  const [users, kpis, plans, pendings, logEntries, announcements, schedules, evidences, commissionRules] = await Promise.all([
    prisma.user.findMany({ where: { storeId: session.storeId }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.kpi.findMany({ where: { storeId: session.storeId, ...own }, orderBy: [{ ranking: "asc" }, { createdAt: "desc" }] }),
    prisma.dayPlan.findMany({ where: { storeId: session.storeId, ...own }, include: { activities: true }, orderBy: { date: "desc" } }),
    prisma.pending.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { ownerId: session.userId }) }, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] }),
    prisma.storeLog.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { authorId: session.userId }) }, orderBy: { createdAt: "asc" } }),
    prisma.announcement.findMany({ where: { storeId: session.storeId }, include: { reads: true }, orderBy: { createdAt: "desc" } }),
    prisma.schedule.findMany({ where: { storeId: session.storeId, ...own }, orderBy: [{ userId: "asc" }, { date: "asc" }] }),
    prisma.evidence.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { uploadedById: session.userId }) }, orderBy: { createdAt: "desc" } }),
    prisma.commissionRule.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { OR: [{ role: session.role }, { role: null }] }) }, orderBy: [{ active: "desc" }, { role: "asc" }, { minAchievement: "asc" }] })
  ]);

  return NextResponse.json({
    users: users.map((user) => ({ id: user.id, name: user.name, employeeNumber: user.employeeNumber, role: user.role, avatar: user.name.slice(0, 2).toUpperCase(), photoUrl: user.photoUrl, biometricEnabled: user.biometricEnabled, lastLoginAt: user.lastLoginAt?.toISOString() ?? null })),
    kpis: kpis.map((kpi) => ({ userId: kpi.userId, dailySales: Number(kpi.dailySales), monthlySales: Number(kpi.monthlySales), dailyGoal: Number(kpi.dailyGoal), monthlyGoal: Number(kpi.monthlyGoal), avgTicket: Number(kpi.avgTicket), upt: Number(kpi.upt), conversion: Number(kpi.conversion), pieces: kpi.pieces, transactions: kpi.transactions, ranking: kpi.ranking, discountMargin: Number(kpi.discountMargin), commissionAmount: Number(kpi.commissionAmount), commissionPercent: Number(kpi.commissionPercent) })),
    plans: plans.map((plan) => ({ id: plan.id, userId: plan.userId, date: plan.date.toISOString().slice(0, 10), dailyGoal: Number(plan.dailyGoal), focus: plan.focus, message: plan.message, activities: plan.activities.map((activity) => ({ id: activity.id, title: activity.title, completed: activity.completed })) })),
    pendings: pendings.map((pending) => ({ id: pending.id, title: pending.title, description: pending.description, category: lower(pending.category), priority: lower(pending.priority), ownerId: pending.ownerId, status: lower(pending.status), dueDate: pending.dueDate.toISOString().slice(0, 10) })),
    logEntries: logEntries.map((entry) => ({ id: entry.id, date: entry.createdAt.toISOString(), authorId: entry.authorId, category: entry.category, description: entry.description, evidenceUrl: entry.evidenceUrl })),
    announcements: announcements.map((announcement) => ({ id: announcement.id, title: announcement.title, body: announcement.body, authorId: announcement.authorId, date: announcement.createdAt.toISOString().slice(0, 10), readBy: announcement.reads.map((read) => read.userId) })),
    schedules: schedules.map((shift) => ({ id: shift.id, userId: shift.userId, day: shift.day, start: shift.startTime ?? shift.statusRaw ?? shift.status, end: shift.endTime ?? "", zone: shift.zone ?? "" })),
    evidences: evidences.map((evidence) => ({ id: evidence.id, storeId: evidence.storeId, uploadedById: evidence.uploadedById, pendingId: evidence.pendingId, logEntryId: evidence.logEntryId, taskId: evidence.taskId, url: evidence.url, fileName: evidence.fileName, mimeType: evidence.mimeType, note: evidence.note, createdAt: evidence.createdAt.toISOString() })),
    commissionRules: commissionRules.map((rule) => ({ id: rule.id, storeId: rule.storeId, role: rule.role, minSales: Number(rule.minSales), maxSales: rule.maxSales === null ? null : Number(rule.maxSales), minAchievement: Number(rule.minAchievement), maxAchievement: rule.maxAchievement === null ? null : Number(rule.maxAchievement), commissionPercent: Number(rule.commissionPercent), active: rule.active }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
