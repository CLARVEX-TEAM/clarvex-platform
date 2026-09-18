import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyArrival, type AttendanceStatus } from "@/lib/attendance";
import { recordAudit } from "@/lib/audit";
import { denyDemo, enforceUploadRateLimit, isApiError, parseJson, requireSession } from "@/lib/api";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import { validateEvidenceImage } from "@/lib/evidence";
import { dayBalanceMinutes } from "@/lib/hours-balance";
import { isNativeDeviceError, requireNativeDevice } from "@/lib/native-device-auth";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { deleteFromR2, uploadToR2 } from "@/lib/r2";
import { storeKey } from "@/lib/r2-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const attendanceStatuses = ["ON_TIME", "LATE", "ABSENT", "EXCUSED", "REST", "VACATION", "PAID_DAY", "INVENTORY"] as const;

const evidenceSchema = z.object({
  data: z.string().min(16).max(8_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  name: z.string().trim().min(1).max(120)
});

const createSchema = z.object({
  date: z.string().regex(DATE_RE),
  requestedStatus: z.enum(attendanceStatuses),
  requestedArrivedAt: z.string().regex(TIME_RE).nullable(),
  requestedLeftAt: z.string().regex(TIME_RE).nullable(),
  reason: z.string().trim().min(8, "Explica brevemente qué se debe corregir.").max(500),
  evidence: evidenceSchema.optional()
});

const reviewSchema = z.object({
  requestId: z.string().min(8).max(64),
  action: z.enum(["APPROVE", "REJECT"]),
  managerNote: z.string().trim().max(500).nullable().optional()
});

function decodeBase64(value: string): Uint8Array | null {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    return null;
  }
}

function withinCorrectionWindow(date: string): boolean {
  const value = new Date(`${date}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(value)) return false;
  const today = new Date(`${dashboardDateKey()}T00:00:00.000Z`).getTime();
  return value >= today - 60 * 86_400_000 && value <= today;
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;
  const device = await requireNativeDevice(request, session);
  if (isNativeDeviceError(device)) return device;
  if (session.checklistOnly) return NextResponse.json({ error: "El kiosco no registra correcciones personales." }, { status: 403 });

  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  if (!withinCorrectionWindow(parsed.data.date)) {
    return NextResponse.json({ error: "La fecha debe estar dentro de los últimos 60 días." }, { status: 400 });
  }

  const existing = await prisma.attendanceCorrectionRequest.findFirst({
    where: {
      storeId: session.storeId,
      userId: session.userId,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      status: "PENDING"
    },
    select: { id: true }
  });
  if (existing) return NextResponse.json({ error: "Ya tienes una corrección en revisión para ese día." }, { status: 409 });

  let evidenceUrl: string | null = null;
  if (parsed.data.evidence) {
    const limited = await enforceUploadRateLimit(session.userId);
    if (limited) return limited;
    const bytes = decodeBase64(parsed.data.evidence.data);
    if (!bytes) return NextResponse.json({ error: "La evidencia no es una imagen válida." }, { status: 400 });
    const validation = validateEvidenceImage({ type: parsed.data.evidence.mimeType, size: bytes.byteLength }, bytes);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });
    const key = storeKey(session.storeId, "evidences", `attendance-correction-${session.userId}-${Date.now()}-${crypto.randomUUID()}.${validation.extension}`);
    try {
      evidenceUrl = await uploadToR2(key, bytes, parsed.data.evidence.mimeType);
    } catch {
      return NextResponse.json({ error: "No se pudo guardar la evidencia. Intenta nuevamente." }, { status: 503 });
    }
  }

  try {
    const correction = await prisma.attendanceCorrectionRequest.create({
      data: {
        storeId: session.storeId,
        userId: session.userId,
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        requestedStatus: parsed.data.requestedStatus,
        requestedArrivedAt: parsed.data.requestedArrivedAt,
        requestedLeftAt: parsed.data.requestedLeftAt,
        reason: parsed.data.reason,
        evidenceUrl
      }
    });

    const managers = await prisma.user.findMany({
      where: { storeId: session.storeId, active: true, role: { in: ["GERENTE", "SUBGERENTE"] }, id: { not: session.userId } },
      select: { id: true }
    });
    const managerIds = managers.map((manager) => manager.id);
    const title = "Corrección de asistencia";
    const body = `${session.name} solicita revisar el ${parsed.data.date}.`;
    await createNotifications(prisma, managerIds.map((userId) => ({
      storeId: session.storeId,
      userId,
      type: "ATTENDANCE_CORRECTION" as const,
      title,
      body
    })));
    dispatchPushToUsers(managerIds, { title, body, tag: `attendance-correction-${correction.id}`, url: "/mi-dia?seccion=correcciones" }).catch(() => undefined);
    await recordAudit({
      session,
      action: "attendance.correction.request",
      entity: "AttendanceCorrectionRequest",
      entityId: correction.id,
      storeId: session.storeId,
      detail: `${parsed.data.date} · ${parsed.data.requestedStatus} · evidencia=${Boolean(evidenceUrl)}`
    });
    return NextResponse.json({ ok: true, id: correction.id }, { status: 201 });
  } catch (error) {
    if (evidenceUrl) await deleteFromR2(evidenceUrl).catch(() => undefined);
    throw error;
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  if (session.role !== "GERENTE" && session.role !== "SUBGERENTE" && !session.platformAdmin) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }
  const demo = denyDemo(session);
  if (demo) return demo;
  const device = await requireNativeDevice(request, session);
  if (isNativeDeviceError(device)) return device;

  const parsed = await parseJson(request, reviewSchema);
  if ("response" in parsed) return parsed.response;
  const correction = await prisma.attendanceCorrectionRequest.findFirst({
    where: { id: parsed.data.requestId, storeId: session.storeId, status: "PENDING" }
  });
  if (!correction) return NextResponse.json({ error: "La solicitud ya fue resuelta o no existe." }, { status: 404 });
  if (correction.userId === session.userId) {
    return NextResponse.json({ error: "Otra persona de gerencia debe revisar tu propia solicitud." }, { status: 403 });
  }

  const now = new Date();
  if (parsed.data.action === "APPROVE") {
    const [current, schedule] = await Promise.all([
      prisma.attendance.findUnique({ where: { userId_date: { userId: correction.userId, date: correction.date } } }),
      prisma.schedule.findUnique({ where: { userId_date: { userId: correction.userId, date: correction.date } } })
    ]);
    const expectedAt = current?.expectedAt ?? schedule?.startTime ?? "10:30";
    const expectedLeaveAt = current?.expectedLeaveAt ?? schedule?.endTime ?? "21:00";
    const arrivedAt = correction.requestedArrivedAt;
    const leftAt = correction.requestedLeftAt;
    const status = correction.requestedStatus as AttendanceStatus;
    const minutesLate = arrivedAt ? classifyArrival({ expected: expectedAt, arrived: arrivedAt }).minutesLate : 0;
    const minutesBalance = dayBalanceMinutes({ status, expectedEntry: expectedAt, expectedExit: expectedLeaveAt, arrivedAt, leftAt });

    await prisma.$transaction(async (tx) => {
      await tx.attendance.upsert({
        where: { userId_date: { userId: correction.userId, date: correction.date } },
        update: { status, arrivedAt, leftAt, minutesLate, minutesBalance, source: "MANUAL", note: parsed.data.managerNote ?? correction.reason },
        create: {
          storeId: session.storeId,
          userId: correction.userId,
          date: correction.date,
          status,
          expectedAt,
          expectedLeaveAt,
          arrivedAt,
          leftAt,
          minutesLate,
          minutesBalance,
          source: "MANUAL",
          note: parsed.data.managerNote ?? correction.reason
        }
      });
      await tx.attendanceCorrectionRequest.update({
        where: { id: correction.id },
        data: { status: "APPROVED", managerNote: parsed.data.managerNote ?? null, reviewedById: session.userId, reviewedAt: now }
      });
    });
  } else {
    await prisma.attendanceCorrectionRequest.update({
      where: { id: correction.id },
      data: { status: "REJECTED", managerNote: parsed.data.managerNote ?? null, reviewedById: session.userId, reviewedAt: now }
    });
  }

  const approved = parsed.data.action === "APPROVE";
  const title = approved ? "Corrección aprobada" : "Corrección revisada";
  const body = approved
    ? `Tu asistencia del ${correction.date.toISOString().slice(0, 10)} fue corregida.`
    : `Tu solicitud del ${correction.date.toISOString().slice(0, 10)} no fue aprobada.`;
  await createNotifications(prisma, [{ storeId: session.storeId, userId: correction.userId, type: "ATTENDANCE_CORRECTION" as const, title, body }]);
  dispatchPushToUsers([correction.userId], { title, body, tag: `attendance-correction-${correction.id}`, url: "/mi-dia?seccion=asistencia" }).catch(() => undefined);
  await recordAudit({
    session,
    action: approved ? "attendance.correction.approve" : "attendance.correction.reject",
    entity: "AttendanceCorrectionRequest",
    entityId: correction.id,
    storeId: session.storeId,
    detail: `${correction.userId} · ${correction.date.toISOString().slice(0, 10)}${parsed.data.managerNote ? ` · ${parsed.data.managerNote}` : ""}`
  });
  return NextResponse.json({ ok: true, status: approved ? "APPROVED" : "REJECTED" });
}
