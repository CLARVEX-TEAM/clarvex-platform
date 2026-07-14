import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { classifyArrival, type AttendanceStatus } from "@/lib/attendance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Rango [inicio, fin) del mes en UTC, igual que se guardan las fechas. */
function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1))
  };
}

/**
 * GET /api/attendance?month=YYYY-MM
 *
 * Gerencia ve a todo el equipo. Un asesor ve SOLO lo suyo — y puede verlo, que
 * es lo importante: si un retardo está mal, tiene con qué reclamar antes de que
 * llegue a nómina.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "Indica el mes en formato YYYY-MM." }, { status: 400 });
  }
  const { start, end } = monthRange(month);
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";

  const [users, records, schedules] = await Promise.all([
    prisma.user.findMany({
      where: { storeId: session.storeId, active: true, ...(manager ? {} : { id: session.userId }) },
      // hoursOwed: el saldo que traían del Excel. Es el punto de partida del
      // banco de horas — la app solo suma lo que registra a partir de ahora.
      select: { id: true, name: true, employeeNumber: true, role: true, photoUrl: true, hoursOwed: true },
      orderBy: [{ role: "asc" }, { name: "asc" }]
    }),
    prisma.attendance.findMany({
      where: { storeId: session.storeId, date: { gte: start, lt: end }, ...(manager ? {} : { userId: session.userId }) },
      orderBy: { date: "asc" }
    }),
    // Los HORARIOS traen meses de historia; la asistencia arrancó apenas. Los
    // domingos y festivos trabajados se sacan de aquí cuando no hay asistencia,
    // así el histórico no sale en cero (ver workedDays en lib/attendance-view).
    prisma.schedule.findMany({
      where: { storeId: session.storeId, date: { gte: start, lt: end }, ...(manager ? {} : { userId: session.userId }) },
      select: { userId: true, date: true, status: true },
      orderBy: { date: "asc" }
    })
  ]);

  return NextResponse.json({
    month,
    canEdit: manager,
    users,
    schedules: schedules.map((day) => ({
      userId: day.userId,
      date: day.date.toISOString().slice(0, 10),
      status: day.status
    })),
    records: records.map((record) => ({
      id: record.id,
      userId: record.userId,
      date: record.date.toISOString().slice(0, 10),
      expectedAt: record.expectedAt,
      expectedLeaveAt: record.expectedLeaveAt,
      arrivedAt: record.arrivedAt,
      leftAt: record.leftAt,
      minutesLate: record.minutesLate,
      minutesBalance: record.minutesBalance,
      status: record.status,
      entryText: record.entryText,
      source: record.source,
      note: record.note
    }))
  }, { headers: { "Cache-Control": "private, no-store" } });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ON_TIME", "LATE", "ABSENT", "EXCUSED", "REST", "VACATION", "PAID_DAY", "INVENTORY"]),
  arrivedAt: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional()
});

/**
 * PATCH /api/attendance — corrección manual de gerencia.
 *
 * Queda marcada como source=MANUAL, y a partir de ahí el archivo YA NO la pisa
 * (ver lib/attendance-sync). Todo cambio se audita: esto va a nómina y tiene que
 * poder defenderse si alguien reclama.
 */
export async function PATCH(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const { userId, date, status, arrivedAt, note } = parsed.data;

  // El usuario tiene que ser de esta tienda (no se corrige a nadie de otra).
  const target = await prisma.user.findFirst({ where: { id: userId, storeId: session.storeId }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: "Colaborador no encontrado." }, { status: 404 });

  const day = new Date(`${date}T00:00:00.000Z`);
  const previous = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: day } } });
  const expectedAt = previous?.expectedAt ?? "10:30";

  // Si gerencia captura una hora, se recalcula el retardo con la misma regla que
  // el archivo: no se deja que la hora y el estatus se contradigan.
  const recomputed = arrivedAt ? classifyArrival({ expected: expectedAt, arrived: arrivedAt }) : null;
  const finalStatus: AttendanceStatus = recomputed && status === recomputed.status ? recomputed.status : status;
  const minutesLate = recomputed ? recomputed.minutesLate : 0;

  const data = {
    storeId: session.storeId,
    expectedAt,
    arrivedAt: arrivedAt ?? null,
    minutesLate,
    status: finalStatus,
    note: note ?? null,
    source: "MANUAL"
  };

  const record = await prisma.attendance.upsert({
    where: { userId_date: { userId, date: day } },
    update: data,
    create: { ...data, userId, date: day }
  });

  await recordAudit({
    session,
    action: "attendance.update",
    entity: "Attendance",
    entityId: record.id,
    storeId: session.storeId,
    detail: `${target.name} · ${date}: ${previous?.status ?? "(sin registro)"} → ${finalStatus}${arrivedAt ? ` (${arrivedAt})` : ""}${note ? ` · ${note}` : ""}`
  });

  return NextResponse.json({
    record: {
      id: record.id,
      userId: record.userId,
      date,
      expectedAt: record.expectedAt,
      arrivedAt: record.arrivedAt,
      minutesLate: record.minutesLate,
      status: record.status,
      entryText: record.entryText,
      source: record.source,
      note: record.note
    }
  });
}
