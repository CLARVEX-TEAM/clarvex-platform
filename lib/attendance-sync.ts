import { classifyDay, TOLERANCE_MINUTES, CUTOFF_MINUTES, expectedEntry, toMinutes, type ScheduledStatus } from "@/lib/attendance";
import { parseAttendanceWorkbook } from "@/lib/attendance-parser";
import { dayBalanceMinutes, DEFAULT_EXIT } from "@/lib/hours-balance";
import { monterreyMinutesOfDay, resolveMonterreyDate } from "@/lib/cron-time";
import { buildUserByEmployeeNumber } from "@/lib/employee-match";
import { prisma } from "@/lib/prisma";
import type { WorkBook } from "@/lib/spreadsheet";

/**
 * Importa la hoja APERTURA y guarda la asistencia del día.
 *
 * La hoja se SOBRESCRIBE cada día: solo tiene el día en curso. Por eso el cron
 * corre varias veces (12:00 / 18:00 / 22:00) y esto es idempotente — cada
 * corrida actualiza el mismo registro y la última gana.
 *
 * Tres salvaguardas, porque esto alimenta nómina:
 *
 * 1. La hoja debe declarar la fecha de HOY (celda M3). Si no, no se guarda nada
 *    y se avisa: el archivo lleva días sin abrirse y guardaríamos datos de otro
 *    día como si fueran de hoy.
 *
 * 2. No se marca FALTA antes de tiempo. Si a alguien le toca entrar a las 13:00
 *    y el cron corre a las 12:00, todavía no ha faltado: se omite hasta que pase
 *    su hora de corte. Sin esto, la corrida de mediodía inventaría faltas a todo
 *    el turno de la tarde.
 *
 * 3. Nunca se pisa una corrección MANUAL de gerencia. Si alguien ya arregló un
 *    día a mano, el archivo no lo revierte.
 */

export type AttendanceSyncMetrics = {
  sheetDate: string | null;
  employeesFound: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  /** Omitidos porque su hora de corte aún no llega (no son faltas todavía). */
  recordsPending: number;
  /** Omitidos por tener una corrección manual de gerencia. */
  recordsManual: number;
  employeesNotFound: string[];
  unknownEntries: Record<string, number>;
  errors: string[];
};

/** El horario del día manda; si no trae hora, la entrada estándar de la tienda. */
/**
 * Hora a la que se espera a alguien: la de su horario, y si no la tiene (o es
 * ilegible) la estándar de tienda. Se exporta porque la captura manual
 * (`lib/attendance-capture`) tiene que clasificar el día con EXACTAMENTE el
 * mismo criterio que el archivo; si divergieran, el mismo retardo contaría
 * distinto según quién lo registró.
 */
// Se reexporta desde `lib/attendance` para no romper a quien ya la importaba
// de aqui. Se movio alli porque este modulo carga Prisma, y eso impedia probar
// las vias de captura nuevas sin levantar la base.
export { expectedEntry };

export async function importAttendance(workbook: WorkBook, storeId: string, now = new Date()): Promise<AttendanceSyncMetrics> {
  const parsed = parseAttendanceWorkbook(workbook);
  const today = resolveMonterreyDate(now);
  const errors: string[] = [];

  const base: AttendanceSyncMetrics = {
    sheetDate: parsed.sheetDate,
    employeesFound: 0,
    recordsProcessed: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsPending: 0,
    recordsManual: 0,
    employeesNotFound: [],
    unknownEntries: parsed.unknownEntries,
    errors
  };

  // Salvaguarda 1: el archivo tiene que ser el de hoy.
  if (parsed.sheetDate !== today.dateKey) {
    errors.push(
      `El archivo de asistencia declara la fecha ${parsed.sheetDate ?? "(vacía)"} y hoy es ${today.dateKey}. ` +
      `No se guardó nada: probablemente no se ha abierto ni capturado hoy.`
    );
    return base;
  }

  const employeeNumbers = parsed.rows.map((row) => row.employeeNumber);
  const users = employeeNumbers.length > 0
    ? await prisma.user.findMany({
        where: { storeId, OR: [{ employeeNumber: { in: employeeNumbers } }, { employeeNumberAliases: { some: { employeeNumber: { in: employeeNumbers } } } }] },
        select: { id: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      })
    : [];
  const userByEmployee = buildUserByEmployeeNumber(users);
  base.employeesFound = users.length;
  base.employeesNotFound = employeeNumbers.filter((number) => !userByEmployee.has(number));

  const date = today.utcDate;
  const userIds = Array.from(new Set(parsed.rows.flatMap((row) => {
    const id = userByEmployee.get(row.employeeNumber);
    return id ? [id] : [];
  })));

  // Contexto del día: qué le tocaba a cada quien y quién tenía permiso.
  // Ojo: ShiftRequest usa `requesterId` y guarda la fecha como texto "YYYY-MM-DD".
  const [schedules, excusedRequests, existing] = await Promise.all([
    prisma.schedule.findMany({ where: { storeId, userId: { in: userIds }, date }, select: { userId: true, status: true, startTime: true, endTime: true } }),
    prisma.shiftRequest.findMany({
      where: { storeId, requesterId: { in: userIds }, date: today.dateKey, type: "ENTRAR_TARDE", status: "APROBADO" },
      select: { requesterId: true }
    }),
    prisma.attendance.findMany({ where: { storeId, userId: { in: userIds }, date }, select: { userId: true, source: true } })
  ]);

  const scheduleByUser = new Map(schedules.map((row) => [row.userId, row]));
  const excusedUsers = new Set(excusedRequests.map((row) => row.requesterId));
  const manualUsers = new Set(existing.filter((row) => row.source === "MANUAL").map((row) => row.userId));
  const existingUsers = new Set(existing.map((row) => row.userId));

  // Hora local de Monterrey, NO UTC: el VPS corre en UTC y compararlo contra un
  // horario local ("10:30") desfasaría 6 horas — y la corrida de la madrugada le
  // pondría FALTA a todo el equipo antes de que la tienda abra.
  const nowMinutes = monterreyMinutesOfDay(now);

  for (const row of parsed.rows) {
    const userId = userByEmployee.get(row.employeeNumber);
    if (!userId) continue;
    base.recordsProcessed += 1;

    // Salvaguarda 3: una corrección manual de gerencia no se pisa.
    if (manualUsers.has(userId)) {
      base.recordsManual += 1;
      continue;
    }

    const schedule = scheduleByUser.get(userId);
    const scheduled = (schedule?.status ?? null) as ScheduledStatus | null;
    const expectedAt = expectedEntry(schedule?.startTime ?? null);
    const excused = excusedUsers.has(userId);

    const result = classifyDay({
      scheduled,
      expected: expectedAt,
      arrived: row.arrived,
      entryText: row.entryText,
      excused
    });

    // Salvaguarda 2: no marcar falta antes de que llegue su hora de corte.
    // (Solo aplica a quien no ha marcado entrada y no tiene texto explícito.)
    if (result.status === "ABSENT" && !row.arrived && !row.entryText) {
      const expectedMinutes = toMinutes(expectedAt);
      const cutoff = expectedMinutes === null ? null : expectedMinutes + CUTOFF_MINUTES;
      if (cutoff !== null && nowMinutes < cutoff) {
        base.recordsPending += 1;
        continue; // todavía no falta: puede estar por llegar
      }
    }

    // Banco de horas: entrar temprano suma, salir temprano resta (ver
    // lib/hours-balance). Se guarda ya calculado para que el histórico no cambie
    // si mañana se ajusta el horario estándar de la tienda.
    const expectedLeaveAt = schedule?.endTime && toMinutes(schedule.endTime) !== null ? schedule.endTime : DEFAULT_EXIT;
    const minutesBalance = dayBalanceMinutes({
      status: result.status,
      expectedEntry: expectedAt,
      expectedExit: expectedLeaveAt,
      arrivedAt: row.arrived,
      leftAt: row.leftAt
    });

    const data = {
      storeId,
      expectedAt,
      expectedLeaveAt,
      arrivedAt: row.arrived,
      lunchStart: row.lunchStart,
      leftAt: row.leftAt,
      minutesLate: result.minutesLate,
      minutesBalance,
      status: result.status,
      entryText: row.entryText,
      source: "APERTURA_XLSX"
    };

    try {
      await prisma.attendance.upsert({
        where: { userId_date: { userId, date } },
        update: data,
        create: { ...data, userId, date }
      });
      if (existingUsers.has(userId)) base.recordsUpdated += 1;
      else { base.recordsCreated += 1; existingUsers.add(userId); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      errors.push(`Empleado ${row.employeeNumber}: ${message}`);
    }
  }

  return base;
}

export { TOLERANCE_MINUTES, CUTOFF_MINUTES };
