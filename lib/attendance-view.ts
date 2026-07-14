import type { AttendanceStatus } from "@/lib/attendance";
import { countsAsAbsence, countsAsLate, earnsSundayPremium } from "@/lib/attendance";
import { holidayLabel, isHoliday } from "@/lib/holidays";

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
  arrivedAt: string | null;
  minutesLate: number;
  status: AttendanceStatus;
  entryText: string | null;
  source: string;
  note: string | null;
};

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

export function totalsFor(records: AttendanceRecord[]): AttendanceTotals {
  const totals: AttendanceTotals = { absences: 0, lates: 0, sundaysWorked: 0, holidaysWorked: 0, minutesLate: 0 };
  for (const record of records) {
    const date = new Date(`${record.date}T00:00:00.000Z`);
    if (countsAsAbsence(record.status)) totals.absences += 1;
    if (countsAsLate(record.status)) {
      totals.lates += 1;
      totals.minutesLate += Math.max(0, record.minutesLate);
    }
    if (earnsSundayPremium(record.status, date)) totals.sundaysWorked += 1;
    if (isHoliday(record.date) && worked(record.status)) totals.holidaysWorked += 1;
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
export function incidentsFor(records: AttendanceRecord[]): Incident[] {
  const incidents: Incident[] = [];
  for (const record of records) {
    const date = new Date(`${record.date}T00:00:00.000Z`);
    if (countsAsAbsence(record.status)) {
      incidents.push({ userId: record.userId, date: record.date, kind: "FALTA", detail: "No se presentó" });
    }
    if (countsAsLate(record.status)) {
      incidents.push({
        userId: record.userId,
        date: record.date,
        kind: "RETARDO",
        detail: `Llegó ${record.arrivedAt ?? "—"} (esperada ${record.expectedAt ?? "—"}, +${Math.max(0, record.minutesLate)} min)`
      });
    }
    if (earnsSundayPremium(record.status, date)) {
      incidents.push({ userId: record.userId, date: record.date, kind: "DOMINGO", detail: "Prima dominical" });
    }
    const holiday = holidayLabel(record.date);
    if (holiday && worked(record.status)) {
      incidents.push({ userId: record.userId, date: record.date, kind: "FESTIVO", detail: holiday });
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
export function totalsByUser(records: AttendanceRecord[]): Map<string, AttendanceTotals> {
  const grouped = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const list = grouped.get(record.userId) ?? [];
    list.push(record);
    grouped.set(record.userId, list);
  }
  return new Map(Array.from(grouped, ([userId, list]) => [userId, totalsFor(list)]));
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
