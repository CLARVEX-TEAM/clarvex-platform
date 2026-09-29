import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { isNativeDeviceError, requireNativeDevice } from "@/lib/native-device-auth";
import { progressPercent, shiftSummary } from "@/lib/my-day";
import { prisma } from "@/lib/prisma";
import { signR2Url } from "@/lib/r2";
import { PERSON_WHERE } from "@/lib/store-people";
import { resumirTienda } from "@/lib/venta-de-tienda";
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

  const [user, store, shift, turnoManana, attendance, kpi, filasDeTienda, plan, pendings, announcements, uniformRows, corrections, unreadNotifications, pendingCorrections, kudos] = await Promise.all([
    prisma.user.findFirst({
      where: { id: session.userId, storeId: session.storeId, active: true },
      select: { id: true, name: true, role: true, photoUrl: true, uniformVariant: true }
    }),
    prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } }),
    prisma.schedule.findUnique({
      where: { userId_date: { userId: session.userId, date: day } },
      select: { status: true, startTime: true, endTime: true, zone: true }
    }),
    /*
     * El turno de MAÑANA. Es otra consulta, pero por el mismo índice único que
     * la de arriba, así que no cuesta nada -- y contesta la pregunta que se
     * hace al final del día: ¿entro mañana, y a qué hora?
     */
    prisma.schedule.findUnique({
      where: { userId_date: { userId: session.userId, date: new Date(day.getTime() + 86_400_000) } },
      select: { status: true, startTime: true, endTime: true }
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
    /*
     * La venta de la TIENDA, solo para gerencia.
     *
     * ⚠️ El candado va AQUÍ, en la consulta, no al pintar. Trayéndola siempre y
     * escondiéndola en la pantalla, la venta de la tienda viajaría dentro de la
     * respuesta que recibe un asesor: la regla de roles dice que no ve ventas ni
     * metas que no sean las suyas, y eso incluye la respuesta, no solo el píxel.
     *
     * ⚠️ `PERSON_WHERE` y no `storeId` a secas: el celular de la tienda está
     * dado de alta con rol ASESOR, y sin ese filtro entra en la lista como
     * alguien que no vendió nada. Ya se coló en doce consultas por eso mismo.
     *
     * ⚠️ Y son las FILAS, no un `aggregate`: el total de la tarjeta se suma de
     * las mismas filas que enseña debajo. Con dos consultas, un filtro que se
     * toque en una y no en la otra deja el total contradiciendo a su lista.
     */
    manager
      ? prisma.kpi.findMany({
          where: { storeId: session.storeId, date: { gte: range.start, lt: range.end }, user: PERSON_WHERE },
          select: {
            userId: true,
            dailySales: true,
            dailyGoal: true,
            transactions: true,
            pieces: true,
            user: { select: { name: true } }
          }
        })
      : Promise.resolve([]),
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
    /*
     * Mañana: si entra o descansa, a qué hora, y qué ropa toca.
     *
     * ⚠️ El uniforme sale de las filas que YA se trajeron --la consulta pide la
     * semana entera y se queda con la de hoy--, así que no cuesta una consulta
     * más. El turno sí es otra, pero por el mismo índice único.
     *
     * ⚠️ Y `null` cuando no hay horario cargado, que NO es lo mismo que
     * descansar: decir «descansas» sobre un horario que nadie ha capturado
     * mandaría a alguien a su casa un día que le tocaba entrar.
     */
    manana: {
      diaSemana: new Date(day.getTime() + 86_400_000).getUTCDay(),
      turno: turnoManana
        ? { status: turnoManana.status, start: turnoManana.startTime, end: turnoManana.endTime }
        : null,
      uniforme: (() => {
        const fila = uniforms.find((row) => row.weekday === new Date(day.getTime() + 86_400_000).getUTCDay());
        return fila ? outfitFor(fila, user.uniformVariant as UniformVariant | null) : null;
      })()
    },
    attendance,
    performance: {
      sales,
      goal,
      progress: progressPercent(sales, goal),
      transactions: kpi?.transactions ?? 0,
      pieces: kpi?.pieces ?? 0
    },
    /*
     * ⚠️ `null` para quien no es gerencia, y también para gerencia cuando
     * NADIE ha capturado todavía. Los dos casos se pintan distinto: el asesor no
     * ve la tarjeta, y gerencia la ve diciendo que aún no hay captura --que no
     * es lo mismo que una tienda con cero vendido--.
     */
    tienda: resumirTienda(
      filasDeTienda.map((fila) => ({
        userId: fila.userId,
        nombre: fila.user.name,
        venta: Number(fila.dailySales),
        meta: Number(fila.dailyGoal),
        tickets: fila.transactions,
        piezas: fila.pieces
      })),
      session.userId
    ),
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
