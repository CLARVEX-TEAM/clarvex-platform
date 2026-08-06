import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { buildUserDashboardKpi, dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { toKpiPayload } from "@/lib/kpi-payload";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";
import { vacationBalances } from "@/lib/vacation-account";

export const dynamic = "force-dynamic";

function lower(value: string) {
  return value.toLowerCase().replace("_", " ");
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const manager = session.role !== "ASESOR";
  const own = manager ? {} : { userId: session.userId };
  // Por defecto solo usuarios ACTIVOS y de carne y hueso: un asesor desactivado
  // no debe aparecer en cumpleaños, ranking ni equipo, y el usuario "kiosko"
  // (checklistOnly, el celular del cierre) tampoco — es una cuenta de dispositivo,
  // no un integrante. La pantalla de gestión de equipo (/equipo) pide
  // includeInactive=1 para poder reactivar cuentas y gestionar el modo kiosko.
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1" && manager;
  const activeFilter = includeInactive ? {} : { active: true, checklistOnly: false };
  const dashboardDate = dashboardDateKey();
  const dashboardRange = dashboardDateRange(dashboardDate);

  const [users, kpis, dashboardRows, plans, pendings, logEntries, announcements, schedules, evidences, commissionRules, commissionStore] = await Promise.all([
    prisma.user.findMany({ where: { storeId: session.storeId, ...activeFilter }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
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
    prisma.dayPlan.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { userId: session.userId, publishedAt: { not: null } }) }, include: { activities: true }, orderBy: { date: "desc" } }),
    prisma.pending.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { ownerId: session.userId }) }, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] }),
    prisma.storeLog.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { authorId: session.userId }) }, orderBy: { createdAt: "asc" } }),
    prisma.announcement.findMany({ where: { storeId: session.storeId }, include: { reads: true, reactions: true }, orderBy: { createdAt: "desc" } }),
    prisma.schedule.findMany({ where: { storeId: session.storeId, ...own }, orderBy: [{ userId: "asc" }, { date: "asc" }] }),
    prisma.evidence.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { uploadedById: session.userId }) }, orderBy: { createdAt: "desc" } }),
    prisma.commissionRule.findMany({ where: { storeId: session.storeId, ...(manager ? {} : { OR: [{ role: session.role }, { role: null }] }) }, orderBy: [{ active: "desc" }, { role: "asc" }, { minAchievement: "asc" }] }),
    // La BASE de comisión: contra el mínimo o contra la meta. En GUESS ese
    // denominador decide el bracket, y con él el pago.
    prisma.store.findUnique({ where: { id: session.storeId }, select: { commissionBasis: true } })
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

  // Evidencias, bitácora y comunicados se sirven con URL firmada de corta vida:
  // el bucket de R2 no expone estos objetos públicamente. La firma es local (no
  // hace red), así que no añade latencia perceptible.
  const [signedEvidenceUrls, signedLogEvidence, signedAnnouncementImages] = await Promise.all([
    Promise.all(evidences.map((evidence) => signR2Url(evidence.url))),
    Promise.all(logEntries.map((entry) => signR2Url(entry.evidenceUrl))),
    Promise.all(announcements.map((announcement) => signR2Url(announcement.imageUrl)))
  ]);

  // Saldo de vacaciones REAL (capturado + ganado en aniversarios − tomado en
  // Horarios). El campo crudo de la BD es solo el punto de partida: mostrarlo tal
  // cual enseñaría un número que se desfasa en cuanto alguien toma vacaciones.
  const vacation = await vacationBalances(users.map((user) => user.id));

  return NextResponse.json({
    // Los saldos de RH (horas, vacaciones, días pagados) son sensibles: solo los
    // ve gerencia o el propio colaborador. Cumpleaños y aniversario (birthDate/
    // hireDate) sí son visibles para todo el equipo (celebraciones).
    users: users.map((user) => {
      const canSeeBalances = manager || user.id === session.userId;
      const days = vacation.get(user.id);
      return {
        id: user.id, name: user.name, employeeNumber: user.employeeNumber, role: user.role, avatar: user.name.slice(0, 2).toUpperCase(), photoUrl: user.photoUrl, biometricEnabled: user.biometricEnabled, lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
        hireDate: user.hireDate ? user.hireDate.toISOString().slice(0, 10) : null,
        ...(canSeeBalances ? {
          hoursOwed: user.hoursOwed,
          vacationDays: days?.available ?? user.vacationDays,
          vacationBaseline: days?.baseline ?? user.vacationDays,
          vacationEarned: days?.earned ?? 0,
          vacationTaken: days?.taken ?? 0,
          vacationPlanned: days?.planned ?? 0,
          paidDays: user.paidDays
        } : {}),
        active: user.active,
        checklistOnly: user.checklistOnly
      };
    }),
    kpis: kpis.map(toKpiPayload),
    dashboardDaily,
    plans: plans.map((plan) => ({ id: plan.id, userId: plan.userId, date: plan.date.toISOString().slice(0, 10), dailyGoal: Number(plan.dailyGoal), focus: plan.focus, message: plan.message, published: plan.publishedAt !== null, activities: plan.activities.map((activity) => ({ id: activity.id, title: activity.title, completed: activity.completed, autoKey: activity.autoKey })) })),
    pendings: pendings.map((pending) => ({ id: pending.id, title: pending.title, description: pending.description, category: lower(pending.category), priority: lower(pending.priority), ownerId: pending.ownerId, status: lower(pending.status), dueDate: pending.dueDate.toISOString().slice(0, 10) })),
    logEntries: logEntries.map((entry, index) => ({ id: entry.id, date: entry.createdAt.toISOString(), authorId: entry.authorId, category: entry.category, description: entry.description, evidenceUrl: signedLogEvidence[index] })),
    announcements: announcements.map((announcement, index) => ({ id: announcement.id, title: announcement.title, body: announcement.body, imageUrl: signedAnnouncementImages[index], authorId: announcement.authorId, date: announcement.createdAt.toISOString().slice(0, 10), readBy: announcement.reads.map((read) => read.userId), reactions: announcement.reactions.map((reaction) => ({ emoji: reaction.emoji, userId: reaction.userId })) })),
    // date + status: la fuente de verdad de quién trabaja cada día es el archivo
    // de Horarios. Sin estos campos, las pantallas tenían que adivinarlo por la
    // meta del RDV (otro archivo), y al reasignar un turno se contradecían.
    schedules: schedules.map((shift) => ({ id: shift.id, userId: shift.userId, date: shift.date.toISOString().slice(0, 10), status: shift.status, day: shift.day, start: shift.startTime ?? shift.statusRaw ?? shift.status, end: shift.endTime ?? "", zone: shift.zone ?? "" })),
    evidences: evidences.map((evidence, index) => ({ id: evidence.id, storeId: evidence.storeId, uploadedById: evidence.uploadedById, pendingId: evidence.pendingId, logEntryId: evidence.logEntryId, taskId: evidence.taskId, url: signedEvidenceUrls[index] ?? evidence.url, fileName: evidence.fileName, mimeType: evidence.mimeType, note: evidence.note, createdAt: evidence.createdAt.toISOString() })),
    commissionBasis: commissionStore?.commissionBasis ?? "MINIMO",
    // `payoutType` y los importes fijos viajan siempre: sin ellos un bracket de
    // importe fijo llega como un porcentaje de 0 y paga cero a quien cumplio.
    commissionRules: commissionRules.map((rule) => ({ id: rule.id, storeId: rule.storeId, role: rule.role, minSales: Number(rule.minSales), maxSales: rule.maxSales === null ? null : Number(rule.maxSales), minAchievement: Number(rule.minAchievement), maxAchievement: rule.maxAchievement === null ? null : Number(rule.maxAchievement), commissionPercent: Number(rule.commissionPercent), active: rule.active, payoutType: rule.payoutType, fixedAmount: rule.fixedAmount === null ? null : Number(rule.fixedAmount), fixedAmountHigh: rule.fixedAmountHigh === null ? null : Number(rule.fixedAmountHigh) }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}
