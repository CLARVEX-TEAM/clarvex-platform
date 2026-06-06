import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function lower(value: string) {
  return value.toLowerCase().replace("_", " ");
}

export async function GET() {
  const [users, kpis, plans, pendings, logEntries, announcements, schedules] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.kpi.findMany({ orderBy: [{ ranking: "asc" }, { createdAt: "desc" }] }),
    prisma.dayPlan.findMany({ include: { activities: true }, orderBy: { date: "desc" } }),
    prisma.pending.findMany({ orderBy: [{ priority: "desc" }, { dueDate: "asc" }] }),
    prisma.storeLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.announcement.findMany({ include: { reads: true }, orderBy: { createdAt: "desc" } }),
    prisma.schedule.findMany({ orderBy: [{ userId: "asc" }, { day: "asc" }] })
  ]);

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      employeeNumber: user.employeeNumber,
      role: user.role,
      avatar: user.name.slice(0, 2).toUpperCase()
    })),
    kpis: kpis.map((kpi) => ({
      userId: kpi.userId,
      dailySales: Number(kpi.dailySales),
      monthlySales: Number(kpi.monthlySales),
      dailyGoal: Number(kpi.dailyGoal),
      monthlyGoal: Number(kpi.monthlyGoal),
      avgTicket: Number(kpi.avgTicket),
      upt: Number(kpi.upt),
      conversion: Number(kpi.conversion),
      pieces: kpi.pieces,
      transactions: kpi.transactions,
      ranking: kpi.ranking
    })),
    plans: plans.map((plan) => ({
      id: plan.id,
      userId: plan.userId,
      date: plan.date.toISOString().slice(0, 10),
      dailyGoal: Number(plan.dailyGoal),
      focus: plan.focus,
      message: plan.message,
      activities: plan.activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        completed: activity.completed
      }))
    })),
    pendings: pendings.map((pending) => ({
      id: pending.id,
      title: pending.title,
      description: pending.description,
      category: lower(pending.category),
      priority: lower(pending.priority),
      ownerId: pending.ownerId,
      status: lower(pending.status),
      dueDate: pending.dueDate.toISOString().slice(0, 10)
    })),
    logEntries: logEntries.map((entry) => ({
      id: entry.id,
      date: entry.createdAt.toISOString(),
      authorId: entry.authorId,
      category: entry.category,
      description: entry.description
    })),
    announcements: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      authorId: announcement.authorId,
      date: announcement.createdAt.toISOString().slice(0, 10),
      readBy: announcement.reads.map((read) => read.userId)
    })),
    schedules: schedules.map((shift) => ({
      id: shift.id,
      userId: shift.userId,
      day: shift.day,
      start: shift.startTime,
      end: shift.endTime ?? "",
      zone: shift.zone ?? ""
    }))
  });
}
