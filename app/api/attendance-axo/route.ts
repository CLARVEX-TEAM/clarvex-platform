import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { rosterDelDia } from "@/lib/attendance-roll-call";
import { recordAudit } from "@/lib/audit";
import { monterreyMinutesOfDay, resolveMonterreyDate } from "@/lib/cron-time";
import {
  attendanceDeadlineState,
  axoAttendancePeriodKey,
  puedeConAsistenciaAxo,
  roleLabel,
  roleOrder
} from "@/lib/operational-checklist-reminders";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


async function responseFor(storeId: string) {
  const today = resolveMonterreyDate();
  const periodKey = axoAttendancePeriodKey(today.dateKey);
  const [store, delivery, roster] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { attendanceFormUrl: true }
    }),
    prisma.reportDelivery.findUnique({
      where: { storeId_periodKey: { storeId, periodKey } },
      select: {
        createdAt: true,
        confirmedBy: { select: { name: true } }
      }
    }),
    rosterDelDia(storeId, today.dateKey)
  ]);

  if (!store?.attendanceFormUrl) {
    return { enabled: false as const };
  }

  const people = roster.ok
    ? roster.result.personas
      .filter((person) => person.scheduled === "WORKING" || person.scheduled === "INVENTORY")
      .sort((a, b) => roleOrder(a.role) - roleOrder(b.role)
        || a.expectedAt.localeCompare(b.expectedAt)
        || a.name.localeCompare(b.name, "es"))
      .map((person) => ({
        name: person.name,
        role: person.role,
        roleLabel: roleLabel(person.role),
        expectedAt: person.expectedAt,
        arrivedAt: person.arrivedAt,
        attendanceCaptured: person.yaCapturado
      }))
    : [];

  return {
    enabled: true as const,
    date: today.dateKey,
    dateLabel: today.dateLabel,
    dueTime: "11:00",
    formUrl: store.attendanceFormUrl,
    status: attendanceDeadlineState(monterreyMinutesOfDay(), delivery?.createdAt ?? null),
    confirmedAt: delivery?.createdAt.toISOString() ?? null,
    confirmedBy: delivery?.confirmedBy.name ?? null,
    people
  };
}

/** Estado diario y lista ordenada como el Forms: gerencia, subgerencia, asesores. */
export async function GET() {
  /*
   * ⚠️ Sin filtro de ROL a proposito: el kiosko es un ASESOR y filtrar por
   * puesto se lo abriria a todo el equipo. Lo decide `puedeConAsistenciaAxo`.
   */
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!puedeConAsistenciaAxo(session)) {
    return NextResponse.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }
  return NextResponse.json(await responseFor(session.storeId));
}

/**
 * Registra la declaración de gerencia después de enviar el Forms. No afirma que
 * Microsoft lo haya recibido: sin permiso del propietario, Clarvex no puede
 * comprobarlo. La auditoría conserva quién hizo la confirmación y a qué hora.
 */
export async function POST() {
  /*
   * ⚠️ Sin filtro de ROL a proposito: el kiosko es un ASESOR y filtrar por
   * puesto se lo abriria a todo el equipo. Lo decide `puedeConAsistenciaAxo`.
   */
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (!puedeConAsistenciaAxo(session)) {
    return NextResponse.json({ error: "No tienes permiso para esta accion." }, { status: 403 });
  }

  const today = resolveMonterreyDate();
  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
    select: { attendanceFormUrl: true }
  });
  if (!store?.attendanceFormUrl) {
    return NextResponse.json({ error: "Esta tienda no tiene un Forms de asistencia configurado." }, { status: 409 });
  }

  const periodKey = axoAttendancePeriodKey(today.dateKey);
  let created = false;
  try {
    await prisma.reportDelivery.create({
      data: {
        storeId: session.storeId,
        kind: "AXO_DAILY",
        periodKey,
        dueDate: today.dateKey,
        confirmedById: session.userId
      }
    });
    created = true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }

  if (created) {
    await recordAudit({
      session,
      action: "attendanceAxo.confirm",
      entity: "ReportDelivery",
      entityId: periodKey,
      storeId: session.storeId,
      detail: `Forms de asistencia AXO confirmado para ${today.dateKey}`
    });
  }

  return NextResponse.json(await responseFor(session.storeId));
}
