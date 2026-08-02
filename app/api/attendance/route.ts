import { PERSON_WHERE } from "@/lib/store-people";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { isApiError, parseJson, requireSession } from "@/lib/api";
import { classifyArrival, type AttendanceStatus } from "@/lib/attendance";
import { dayBalanceMinutes } from "@/lib/hours-balance";
import { hoursBalanceMinutes } from "@/lib/hours-account";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Rango [inicio, fin) del mes NATURAL en UTC, igual que se guardan las fechas. */
function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1))
  };
}

/**
 * Rango del mes RETAIL correspondiente a ese mes natural.
 *
 * Hace falta porque no son lo mismo y la diferencia va a nomina: agosto 2026
 * natural trae CINCO domingos (2, 9, 16, 23 y 30) y el retail solo CUATRO,
 * porque el 30 ya pertenece a septiembre retail. Reportar por mes natural
 * pagaria una prima dominical de mas por persona.
 *
 * El dia 15 siempre cae dentro de su mes retail: estos empiezan entre el 28
 * del mes anterior y el 5, y terminan entre el 27 y el 3 del siguiente.
 */
function retailRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const bounds = retailMonthBoundsFor(new Date(Date.UTC(year, monthNumber - 1, 15)));
  return { start: bounds.start, end: new Date(bounds.end.getTime() + 86_400_000) };
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
  const natural = monthRange(month);
  const retail = retailRange(month);
  const start = natural.start < retail.start ? natural.start : retail.start;
  const end = natural.end > retail.end ? natural.end : retail.end;
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";

  const [users, records, schedules] = await Promise.all([
    prisma.user.findMany({
      where: { storeId: session.storeId, ...PERSON_WHERE, ...(manager ? {} : { id: session.userId }) },
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

  // Saldo acumulado REAL de cada quien: el inicial del Excel + TODO lo que la app
  // ha registrado (no solo el mes que se está viendo).
  const balances = await hoursBalanceMinutes(users.map((user) => user.id));

  return NextResponse.json({
    month,
    // Los dos rangos, para que el cliente filtre segun lo que este mirando.
    naturalRange: { start: natural.start.toISOString().slice(0, 10), end: new Date(natural.end.getTime() - 86_400_000).toISOString().slice(0, 10) },
    retailRange: { start: retail.start.toISOString().slice(0, 10), end: new Date(retail.end.getTime() - 86_400_000).toISOString().slice(0, 10) },
    canEdit: manager,
    users: users.map((user) => ({ ...user, balanceMinutes: balances.get(user.id) ?? 0 })),
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

const TIME_RE = /^\d{1,2}:\d{2}$/;
const patchSchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ON_TIME", "LATE", "ABSENT", "EXCUSED", "REST", "VACATION", "PAID_DAY", "INVENTORY"]),
  arrivedAt: z.string().regex(TIME_RE).nullable().optional(),
  leftAt: z.string().regex(TIME_RE).nullable().optional(),
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
  const { userId, date, status, arrivedAt, leftAt, note } = parsed.data;

  // El usuario tiene que ser de esta tienda (no se corrige a nadie de otra).
  const target = await prisma.user.findFirst({ where: { id: userId, storeId: session.storeId }, select: { id: true, name: true } });
  if (!target) return NextResponse.json({ error: "Colaborador no encontrado." }, { status: 404 });

  const day = new Date(`${date}T00:00:00.000Z`);
  const previous = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: day } } });
  const expectedAt = previous?.expectedAt ?? "10:30";
  const expectedLeaveAt = previous?.expectedLeaveAt ?? "21:00";

  // Gerencia elige el estatus; el retardo (minutesLate) se recalcula de la hora de
  // entrada con la misma regla que el archivo, para que hora y estatus no se
  // contradigan en el reporte.
  const minutesLate = arrivedAt ? classifyArrival({ expected: expectedAt, arrived: arrivedAt }).minutesLate : 0;

  // ⚠️ El saldo del banco de horas se RECALCULA con la entrada y salida capturadas.
  // Sin esto, corregir una hora dejaba el saldo viejo — y el saldo va a nómina.
  const minutesBalance = dayBalanceMinutes({
    status: status as AttendanceStatus,
    expectedEntry: expectedAt,
    expectedExit: expectedLeaveAt,
    arrivedAt: arrivedAt ?? null,
    leftAt: leftAt ?? null
  });

  const data = {
    storeId: session.storeId,
    expectedAt,
    expectedLeaveAt,
    arrivedAt: arrivedAt ?? null,
    leftAt: leftAt ?? null,
    minutesLate,
    minutesBalance,
    status: status as AttendanceStatus,
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
    detail: `${target.name} · ${date}: ${previous?.status ?? "(sin registro)"} → ${status}${arrivedAt ? ` entra ${arrivedAt}` : ""}${leftAt ? ` sale ${leftAt}` : ""} · saldo ${minutesBalance >= 0 ? "+" : ""}${minutesBalance}m${note ? ` · ${note}` : ""}`
  });

  return NextResponse.json({
    record: {
      id: record.id,
      userId: record.userId,
      date,
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
    }
  });
}
