import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { isNativeDeviceError, requireNativeDevice } from "@/lib/native-device-auth";
import { progressPercent, shiftSummary } from "@/lib/my-day";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";
import { mergeWithDefaults, outfitFor, type UniformDay, type UniformVariant } from "@/lib/uniforms";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const device = await requireNativeDevice(request, session);
  if (isNativeDeviceError(device)) return device;
  if (session.checklistOnly) {
    return NextResponse.json({ error: "El kiosco abre directamente el checklist." }, { status: 403 });
  }

  const date = dashboardDateKey();
  const range = dashboardDateRange(date);
  const day = new Date(`${date}T00:00:00.000Z`);
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE" || session.platformAdmin;

  /*
   * ⚠️ El mes de los Kudos es el RETAIL, no el natural. Es el mismo criterio que
   * usa todo lo demás de la app --y mezclarlos ya costó una prima dominical de
   * más por persona en agosto.
   */
  const mesRetail = retailMonthBoundsFor(day);

  const [user, store, shift, attendance, kpi, plan, pendings, announcements, uniformRows, corrections, unreadNotifications, pendingCorrections, kudos] = await Promise.all([
    prisma.user.findFirst({
      where: { id: session.userId, storeId: session.storeId, active: true },
      select: { id: true, name: true, role: true, photoUrl: true, uniformVariant: true }
    }),
    prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } }),
    prisma.schedule.findUnique({
      where: { userId_date: { userId: session.userId, date: day } },
      select: { status: true, startTime: true, endTime: true, zone: true }
    }),
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session.userId, date: day } },
      select: { status: true, expectedAt: true, arrivedAt: true, expectedLeaveAt: true, leftAt: true, minutesLate: true }
    }),
    prisma.kpi.findFirst({
      where: { storeId: session.storeId, userId: session.userId, date: { gte: range.start, lt: range.end } },
      orderBy: { updatedAt: "desc" },
      select: { dailyGoal: true, dailySales: true, transactions: true, pieces: true }
    }),
    prisma.dayPlan.findFirst({
      where: {
        storeId: session.storeId,
        userId: session.userId,
        date: { gte: range.start, lt: range.end },
        ...(session.role === "ASESOR" ? { publishedAt: { not: null } } : {})
      },
      include: { activities: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.pending.findMany({
      where: { storeId: session.storeId, ownerId: session.userId, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 5
    }),
    prisma.announcement.findMany({
      where: { storeId: session.storeId },
      include: { reads: { where: { userId: session.userId }, select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.uniformDay.findMany({ where: { storeId: session.storeId }, orderBy: { weekday: "asc" } }),
    prisma.attendanceCorrectionRequest.findMany({
      where: { storeId: session.storeId, ...(manager ? {} : { userId: session.userId }) },
      orderBy: { createdAt: "desc" },
      take: manager ? 8 : 4,
      include: { user: { select: { name: true } } }
    }),
    prisma.notification.count({ where: { storeId: session.storeId, userId: session.userId, readAt: null } }),
    manager ? prisma.attendanceCorrectionRequest.count({ where: { storeId: session.storeId, status: "PENDING" } }) : Promise.resolve(0),
    prisma.kudo.findMany({
      where: {
        storeId: session.storeId,
        toUserId: session.userId,
        // `retailMonthBoundsFor` devuelve FECHAS, no cadenas: envolverlas en una
        // plantilla daba una fecha inválida, y eso no lo atrapa el tipado.
        createdAt: { gte: mesRetail.start, lte: mesRetail.end }
      },
      select: { emoji: true, message: true, createdAt: true, fromUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      // Tope bajo a propósito: solo hace falta contar y enseñar el último.
      take: 50
    })
  ]);

  if (!user || !store) return NextResponse.json({ error: "No se encontró tu jornada." }, { status: 404 });

  const uniforms: UniformDay[] = mergeWithDefaults(uniformRows.map((row) => ({
    weekday: row.weekday,
    womanTop: row.womanTop,
    womanBottom: row.womanBottom,
    manTop: row.manTop,
    manBottom: row.manBottom,
    note: row.note
  })));
  const uniformDay = uniforms.find((row) => row.weekday === day.getUTCDay()) ?? uniforms[0];
  const uniform = uniformDay ? outfitFor(uniformDay, user.uniformVariant as UniformVariant | null) : null;
  const correctionEvidenceUrls = await Promise.all(corrections.map((correction) => signR2Url(correction.evidenceUrl)));
  const sales = Number(kpi?.dailySales ?? 0);
  const goal = Number(kpi?.dailyGoal ?? plan?.dailyGoal ?? 0);
  const shiftPayload = shift ? { status: shift.status, start: shift.startTime, end: shift.endTime, zone: shift.zone } : null;

  return NextResponse.json({
    date,
    user: { id: user.id, name: user.name, role: user.role, photoUrl: user.photoUrl },
    store: { name: store.name },
    device: { installationId: device.installationId, profile: device.profile, appVersion: device.appVersion },
    shift: shiftPayload ? { ...shiftPayload, summary: shiftSummary(shiftPayload) } : null,
    uniform,
    attendance,
    performance: {
      sales,
      goal,
      progress: progressPercent(sales, goal),
      transactions: kpi?.transactions ?? 0,
      pieces: kpi?.pieces ?? 0
    },
    plan: plan ? {
      id: plan.id,
      focus: plan.focus,
      message: plan.message,
      tasks: plan.activities.map((task) => ({ id: task.id, title: task.title, completed: task.completed }))
    } : null,
    pendings: pendings.map((pending) => ({
      id: pending.id,
      title: pending.title,
      priority: pending.priority,
      status: pending.status,
      dueDate: pending.dueDate.toISOString().slice(0, 10)
    })),
    announcements: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      date: announcement.createdAt.toISOString(),
      read: announcement.reads.length > 0
    })),
    corrections: corrections.map((correction, index) => ({
      id: correction.id,
      userId: correction.userId,
      userName: correction.user.name,
      date: correction.date.toISOString().slice(0, 10),
      requestedStatus: correction.requestedStatus,
      requestedArrivedAt: correction.requestedArrivedAt,
      requestedLeftAt: correction.requestedLeftAt,
      reason: correction.reason,
      evidenceUrl: correctionEvidenceUrls[index],
      status: correction.status,
      managerNote: correction.managerNote,
      createdAt: correction.createdAt.toISOString()
    })),
    counts: {
      unreadAnnouncements: announcements.filter((announcement) => announcement.reads.length === 0).length,
      unreadNotifications,
      openPendings: pendings.length,
      pendingCorrections
    },
    /*
     * ⚠️ Solo los RECIBIDOS, y solo lo último. «Mi día» es una pantalla de
     * arranque: una lista entera de reconocimientos la convertiría en otra cosa
     * y empujaría abajo lo que de verdad hay que hacer hoy. El historial
     * completo sigue en `/kudos`.
     */
    kudos: {
      recibidosMes: kudos.length,
      ultimo: kudos[0]
        ? {
            emoji: kudos[0].emoji,
            message: kudos[0].message,
            deQuien: kudos[0].fromUser.name,
            cuando: kudos[0].createdAt.toISOString()
          }
        : null
    },
    capabilities: {
      canReviewCorrections: manager,
      canOpenChecklist: manager,
      canManageDevices: manager
    }
  }, { headers: { "Cache-Control": "private, no-store" } });
}
