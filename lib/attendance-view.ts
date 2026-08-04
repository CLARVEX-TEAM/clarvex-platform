import type { AttendanceStatus } from "@/lib/attendance";
import { countsAsAbsence, countsAsLate, earnsSundayPremium } from "@/lib/attendance";
import { holidayLabel, isHoliday } from "@/lib/holidays";
import { dayBalanceParts } from "@/lib/hours-balance";

/**
 * Presentación y totales de asistencia. Puro y testeable: los totales son los
 * que se reportan a nómina, así que no viven dentro de un componente.
 */

export type AttendanceRecord = {
  id: string;
  userId: string;
  /** "YYYY-MM-DD" */
  date: string;
  expectedAt: string | null;
  expectedLeaveAt: string | null;
  arrivedAt: string | null;
  leftAt: string | null;
  minutesLate: number;
  /** Saldo del día en minutos. Positivo = horas a favor del colaborador. */
  minutesBalance: number;
  status: AttendanceStatus;
  entryText: string | null;
  source: string;
  note: string | null;
};

/** Saldo de horas del periodo, en minutos. */
export function balanceOf(records: AttendanceRecord[]): number {
  return records.reduce((total, record) => total + record.minutesBalance, 0);
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  ON_TIME: "A tiempo",
  LATE: "Retardo",
  ABSENT: "Falta",
  EXCUSED: "Permiso",
  REST: "Descanso",
  VACATION: "Vacaciones",
  PAID_DAY: "Pago de día",
  INVENTORY: "Conteo"
};

/** Verde a tiempo, ámbar retardo, rojo falta, gris el resto. */
export const STATUS_TONE: Record<AttendanceStatus, string> = {
  ON_TIME: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  LATE: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  ABSENT: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  EXCUSED: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  REST: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  VACATION: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200",
  PAID_DAY: "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
  INVENTORY: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200"
};

/**
 * Etiquetas del día. Casi siempre una —el estatus—, pero el CONTEO con retardo
 * lleva DOS: el día sigue siendo de conteo y además hubo retardo.
 *
 * ⚠️ Sin esto el retardo del conteo no se ve en ninguna parte: el estatus que se
 * guarda sigue siendo INVENTORY, así que la fila diría solo "Conteo" aunque la
 * persona llegara 17 minutos tarde y el retardo ya contara en su total del mes.
 */
export function dayBadges(record: AttendanceRecord): { label: string; tone: string }[] {
  const badges = [{ label: STATUS_LABEL[record.status], tone: STATUS_TONE[record.status] }];
  if (record.status !== "LATE" && countsAsLate(record)) {
    badges.push({ label: STATUS_LABEL.LATE, tone: STATUS_TONE.LATE });
  }
  return badges;
}

export type AttendanceTotals = {
  /** Se reportan cada quincena al supervisor. */
  absences: number;
  /** Se reportan antes del último sábado del mes. */
  lates: number;
  /** Domingos TRABAJADOS: generan prima dominical. */
  sundaysWorked: number;
  /** Festivos oficiales TRABAJADOS: se pagan distinto (LFT Art. 75). */
  holidaysWorked: number;
  /** Minutos acumulados de retardo (solo de los días con retardo). */
  minutesLate: number;
};

/** Se presentó a trabajar (aunque llegara tarde o con permiso). */
function worked(status: AttendanceStatus): boolean {
  return status === "ON_TIME" || status === "LATE" || status === "EXCUSED";
}

/** Un día del archivo de HORARIOS: dice lo PLANEADO, no si llegó. */
export type ScheduleDay = {
  userId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** WORKING | OFF | VACATION | PAID_DAY | INVENTORY | TERMINATED */
  status: string;
};

/**
 * Días efectivamente trabajados, cruzando ambas fuentes.
 *
 * Los domingos y festivos trabajados NO necesitan la asistencia real: basta con
 * saber que a esa persona le tocaba trabajar. Y eso el archivo de HORARIOS lo
 * sabe desde hace meses, mientras que la asistencia arrancó apenas hoy.
 *
 * Si no se cruzara, el histórico saldría en cero y habría que capturar a mano
 * meses de domingos que la app ya tiene delante.
 *
 * La ASISTENCIA manda cuando existe (si estaba programado pero faltó, no lo
 * trabajó); el HORARIO se usa como respaldo para todo lo anterior.
 */
function workedDays(records: AttendanceRecord[], schedules: ScheduleDay[]): Array<{ userId: string; date: string }> {
  const byKey = new Map<string, { userId: string; date: string; worked: boolean }>();
  for (const day of schedules) {
    byKey.set(`${day.userId}:${day.date}`, { userId: day.userId, date: day.date, worked: day.status === "WORKING" });
  }
  for (const record of records) {
    byKey.set(`${record.userId}:${record.date}`, { userId: record.userId, date: record.date, worked: worked(record.status) });
  }
  return Array.from(byKey.values()).filter((day) => day.worked);
}

export function totalsFor(records: AttendanceRecord[], schedules: ScheduleDay[] = []): AttendanceTotals {
  const totals: AttendanceTotals = { absences: 0, lates: 0, sundaysWorked: 0, holidaysWorked: 0, minutesLate: 0 };

  // Faltas y retardos SOLO pueden salir de la asistencia real: el horario dice
  // lo que estaba planeado, no si la persona llegó.
  for (const record of records) {
    if (countsAsAbsence(record.status)) totals.absences += 1;
    if (countsAsLate(record)) {
      totals.lates += 1;
      totals.minutesLate += Math.max(0, record.minutesLate);
    }
  }

  // Domingos y festivos: se cruza con el horario para recuperar el histórico.
  for (const day of workedDays(records, schedules)) {
    if (isSunday(day.date)) totals.sundaysWorked += 1;
    if (isHoliday(day.date)) totals.holidaysWorked += 1;
  }

  return totals;
}

/** Una incidencia suelta, tal cual se captura en Blitz. */
export type Incident = {
  userId: string;
  date: string;
  kind: "FALTA" | "RETARDO" | "DOMINGO" | "FESTIVO";
  detail: string;
};

/**
 * Todas las incidencias del periodo, planas y ordenadas por fecha.
 *
 * Es lo que se lee para capturar en Blitz: no hay exportación a Excel porque esa
 * plataforma no la acepta — se teclea. Así que la pantalla tiene que dar la lista
 * ya masticada, sin que nadie vuelva a contar nada a mano.
 */
export function incidentsFor(records: AttendanceRecord[], schedules: ScheduleDay[] = []): Incident[] {
  const incidents: Incident[] = [];

  // Faltas y retardos: solo de la asistencia real.
  for (const record of records) {
    if (countsAsAbsence(record.status)) {
      incidents.push({ userId: record.userId, date: record.date, kind: "FALTA", detail: "No se presentó" });
    }
    if (countsAsLate(record)) {
      incidents.push({
        userId: record.userId,
        date: record.date,
        kind: "RETARDO",
        detail: `Llegó ${record.arrivedAt ?? "—"} (esperada ${record.expectedAt ?? "—"}, +${Math.max(0, record.minutesLate)} min)`
      });
    }
  }

  // Domingos y festivos: cruzados con el horario, para no perder el histórico.
  for (const day of workedDays(records, schedules)) {
    if (isSunday(day.date)) {
      incidents.push({ userId: day.userId, date: day.date, kind: "DOMINGO", detail: "Prima dominical" });
    }
    const holiday = holidayLabel(day.date);
    if (holiday) {
      incidents.push({ userId: day.userId, date: day.date, kind: "FESTIVO", detail: holiday });
    }
  }

  return incidents.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export const INCIDENT_TONE: Record<Incident["kind"], string> = {
  FALTA: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  RETARDO: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  DOMINGO: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  FESTIVO: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
};

/**
 * Quincena a la que pertenece una fecha: 1 (días 1-15) o 2 (16 al fin de mes).
 * Las faltas se reportan cada quincena.
 */
export function fortnightOf(date: string): 1 | 2 {
  return Number(date.slice(8, 10)) <= 15 ? 1 : 2;
}

/** Totales por colaborador, para el reporte y para la lista de gerencia. */
export function totalsByUser(records: AttendanceRecord[], schedules: ScheduleDay[] = []): Map<string, AttendanceTotals> {
  const userIds = new Set([...records.map((r) => r.userId), ...schedules.map((s) => s.userId)]);
  return new Map(Array.from(userIds, (userId) => [
    userId,
    totalsFor(
      records.filter((record) => record.userId === userId),
      schedules.filter((day) => day.userId === userId)
    )
  ]));
}

/** Un movimiento del banco de horas de un día, ya explicado. */
export type HoursMovement = {
  /** Minutos del movimiento. Positivo = a favor. */
  minutes: number;
  /** Motivo en palabras: "Entró tarde a las 13:00". */
  text: string;
};

/**
 * Explica POR QUÉ el banco de horas se movió ese día, motivo por motivo.
 *
 * Es la transparencia que pide gerencia: no solo "−2:30", sino "entró tarde a las
 * 13:00 · −2:30". La suma de los movimientos es exactamente el saldo del día.
 */
export function hoursMovements(record: AttendanceRecord): HoursMovement[] {
  const parts = dayBalanceParts({
    status: record.status,
    expectedEntry: record.expectedAt,
    expectedExit: record.expectedLeaveAt,
    arrivedAt: record.arrivedAt,
    leftAt: record.leftAt
  });
  return parts.map((part) => {
    if (part.part === "rest") {
      return { minutes: part.minutes, text: `Trabajó en su descanso (${record.arrivedAt}–${record.leftAt})` };
    }
    if (part.part === "entry") {
      return {
        minutes: part.minutes,
        text: part.minutes > 0 ? `Entró temprano a las ${record.arrivedAt}` : `Entró tarde a las ${record.arrivedAt}`
      };
    }
    return {
      minutes: part.minutes,
      text: part.minutes > 0 ? `Salió tarde a las ${record.leftAt}` : `Salió temprano a las ${record.leftAt}`
    };
  });
}

/** "2026-07-14" → "mar 14". Para la lista del mes. */
export function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const weekday = parsed.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${weekday} ${parsed.getUTCDate()}`;
}

export function isSunday(date: string): boolean {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 0;
}

/** Mes actual en formato "YYYY-MM". */
export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}
