import { classifyDay, type ScheduledStatus } from "@/lib/attendance";
import {
  normalizeAttendanceEntry,
  type AttendanceCaptureEntry,
  type NormalizedAttendanceEntry
} from "@/lib/attendance-capture-entry";
import { expectedEntry } from "@/lib/attendance-sync";
import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import { dayBalanceMinutes, DEFAULT_EXIT } from "@/lib/hours-balance";
import { prisma } from "@/lib/prisma";
import { toMinutes } from "@/lib/attendance";

/**
 * Captura manual de asistencia, la vía que sustituye a la hoja APERTURA.
 *
 * Se guarda con `source: "MANUAL"`, y eso importa: el importador del archivo
 * tiene una salvaguarda que NO pisa las filas manuales (ver la "Salvaguarda 3"
 * en `lib/attendance-sync`). Así, si algún día vuelve a entrar el Excel, no
 * borra lo que gerencia corrigió a mano.
 *
 * El estado del día NO se captura: se deriva del horario con las mismas
 * funciones que usa el importador. Es deliberado — dejar que la pantalla
 * mandara el estado permitiría marcar "a tiempo" una llegada tarde, y el
 * retardo es dinero.
 */

export type AttendanceCaptureResult = {
  recordsCreated: number;
  recordsUpdated: number;
  employeesNotFound: string[];
  withoutSchedule: string[];
  errors: string[];
};

export async function captureAttendance(
  storeId: string,
  entries: AttendanceCaptureEntry[]
): Promise<{ ok: false; errors: string[] } | { ok: true; result: AttendanceCaptureResult }> {
  const normalized: NormalizedAttendanceEntry[] = [];
  const errors: string[] = [];
  for (const entry of entries) {
    const outcome = normalizeAttendanceEntry(entry);
    if (outcome.ok) normalized.push(outcome.value);
    else errors.push(outcome.error);
  }
  if (errors.length > 0) return { ok: false, errors };

  const deduped = Array.from(
    new Map(normalized.map((item) => [`${item.employeeNumber}:${item.date.toISOString()}`, item])).values()
  );

  const employeeNumbers = Array.from(new Set(deduped.map((item) => item.employeeNumber)));
  const users = employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: {
          storeId,
          OR: [
            { employeeNumber: { in: employeeNumbers } },
            { employeeNumberAliases: { some: { employeeNumber: { in: employeeNumbers } } } }
          ]
        },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  const employeesNotFound = employeeNumbers.filter((number) => !userByEmployee.has(number));

  const matched = deduped.flatMap((item) => {
    const userId = userByEmployee.get(item.employeeNumber);
    return userId ? [{ ...item, userId }] : [];
  });
  if (matched.length === 0) {
    return { ok: true, result: { recordsCreated: 0, recordsUpdated: 0, employeesNotFound, withoutSchedule: [], errors: [] } };
  }

  const dates = Array.from(new Map(matched.map((item) => [item.date.toISOString(), item.date])).values());
  const userIds = Array.from(new Set(matched.map((item) => item.userId)));

  const [schedules, existing] = await Promise.all([
    prisma.schedule.findMany({
      where: { storeId, userId: { in: userIds }, date: { in: dates } },
      select: { userId: true, date: true, status: true, startTime: true, endTime: true }
    }),
    prisma.attendance.findMany({
      where: { storeId, userId: { in: userIds }, date: { in: dates } },
      select: { userId: true, date: true }
    })
  ]);
  const scheduleByKey = new Map(schedules.map((row) => [`${row.userId}:${row.date.toISOString()}`, row]));
  const existingKeys = new Set(existing.map((row) => `${row.userId}:${row.date.toISOString()}`));

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const withoutSchedule: string[] = [];
  const writeErrors: string[] = [];

  for (const item of matched) {
    const key = `${item.userId}:${item.date.toISOString()}`;
    const schedule = scheduleByKey.get(key);
    // Sin horario no se puede juzgar puntualidad: se avisa y se usa la hora
    // estándar de tienda, igual que hace el importador.
    if (!schedule) withoutSchedule.push(`${item.employeeNumber} (${item.date.toISOString().slice(0, 10)})`);

    const expectedAt = expectedEntry(schedule?.startTime ?? null);
    const result = classifyDay({
      scheduled: (schedule?.status ?? null) as ScheduledStatus | null,
      expected: expectedAt,
      arrived: item.arrivedAt,
      entryText: item.entryText,
      // Los permisos aprobados los concilia el flujo de solicitudes; una captura
      // manual no decide por su cuenta que una ausencia está justificada.
      excused: false
    });

    const expectedLeaveAt = schedule?.endTime && toMinutes(schedule.endTime) !== null ? schedule.endTime : DEFAULT_EXIT;
    const minutesBalance = dayBalanceMinutes({
      status: result.status,
      expectedEntry: expectedAt,
      expectedExit: expectedLeaveAt,
      arrivedAt: item.arrivedAt,
      leftAt: item.leftAt
    });

    const data = {
      storeId,
      expectedAt,
      expectedLeaveAt,
      arrivedAt: item.arrivedAt,
      lunchStart: item.lunchStart,
      leftAt: item.leftAt,
      minutesLate: result.minutesLate,
      minutesBalance,
      status: result.status,
      entryText: item.entryText,
      note: item.note,
      source: "MANUAL"
    };

    try {
      await prisma.attendance.upsert({
        where: { userId_date: { userId: item.userId, date: item.date } },
        update: data,
        create: { ...data, userId: item.userId, date: item.date }
      });
      if (existingKeys.has(key)) recordsUpdated += 1;
      else recordsCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      writeErrors.push(`Empleado ${item.employeeNumber}, fecha ${item.date.toISOString().slice(0, 10)}: ${message}`);
    }
  }

  return {
    ok: true,
    result: { recordsCreated, recordsUpdated, employeesNotFound, withoutSchedule, errors: writeErrors }
  };
}
