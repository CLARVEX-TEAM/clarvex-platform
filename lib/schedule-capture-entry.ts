import { reconstructRdvWeek } from "@/lib/rdv-week";
import { SCHEDULE_STATUS_LABELS, shortDayFromDate, type ParsedScheduleStatus } from "@/lib/schedule-parser";

/**
 * Validación de una fila de horario capturada a mano.
 *
 * Vive aparte de `lib/schedule-capture` a propósito: ese módulo importa Prisma,
 * y `lib/prisma` lanza en el entorno de pruebas para que ningún test unitario
 * toque una base real. Separarlo deja lo delicado —fecha, día, semana,
 * coherencia de horas— cubierto por tests sin levantar Postgres.
 */

/** Estados en los que tiene sentido registrar horas de entrada y salida. */
const STATUSES_WITH_HOURS: ReadonlySet<ParsedScheduleStatus> = new Set<ParsedScheduleStatus>([
  "WORKING",
  // Un día de CONTEO sí se trabaja: la gente entra, y de hecho puede llegar
  // tarde (ver countsAsLate en lib/attendance).
  "INVENTORY"
]);

const VALID_STATUSES = Object.keys(SCHEDULE_STATUS_LABELS) as ParsedScheduleStatus[];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ScheduleCaptureEntry = {
  employeeNumber: string;
  date: string;
  status: string;
  startTime?: string | null;
  endTime?: string | null;
};

export type NormalizedScheduleEntry = {
  employeeNumber: string;
  date: Date;
  day: string;
  weekStart: Date;
  status: ParsedScheduleStatus;
  statusRaw: string;
  startTime: string | null;
  endTime: string | null;
};

export type NormalizeOutcome =
  | { ok: true; value: NormalizedScheduleEntry }
  | { ok: false; error: string };

export function normalizeScheduleEntry(entry: ScheduleCaptureEntry): NormalizeOutcome {
  const employeeNumber = String(entry.employeeNumber ?? "").trim();
  if (!employeeNumber) return { ok: false, error: "Falta el número de empleado." };

  if (!DATE_PATTERN.test(entry.date ?? "")) {
    return { ok: false, error: `Fecha inválida en ${employeeNumber}: se espera AAAA-MM-DD.` };
  }
  // Medianoche UTC, igual que el importador: la clave única de `Schedule` es
  // (userId, date) y se compara por igualdad exacta, así que una hora distinta
  // crearía una fila paralela para el mismo día.
  const date = new Date(`${entry.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `Fecha inexistente en ${employeeNumber}: ${entry.date}.` };
  }
  // `new Date("2026-02-31")` no falla: desborda a marzo. Sin esta comprobación,
  // un día que no existe se guardaría silenciosamente en otra fecha.
  if (date.toISOString().slice(0, 10) !== entry.date) {
    return { ok: false, error: `Fecha inexistente en ${employeeNumber}: ${entry.date}.` };
  }

  const status = entry.status as ParsedScheduleStatus;
  if (!VALID_STATUSES.includes(status)) {
    return {
      ok: false,
      error: `Estado inválido en ${employeeNumber} (${entry.date}): ${String(entry.status)}. Válidos: ${VALID_STATUSES.join(", ")}.`
    };
  }

  const allowsHours = STATUSES_WITH_HOURS.has(status);
  const startTime = normalizeTime(entry.startTime);
  const endTime = normalizeTime(entry.endTime);
  if (startTime === "INVALID" || endTime === "INVALID") {
    return { ok: false, error: `Hora inválida en ${employeeNumber} (${entry.date}): se espera HH:MM.` };
  }
  if (!allowsHours && (startTime || endTime)) {
    return {
      ok: false,
      error: `${employeeNumber} (${entry.date}) está como ${SCHEDULE_STATUS_LABELS[status]} pero trae horario. Un día no laborable no lleva horas.`
    };
  }
  if (allowsHours && startTime && endTime && endTime <= startTime) {
    return { ok: false, error: `${employeeNumber} (${entry.date}): la salida no puede ser anterior o igual a la entrada.` };
  }

  return {
    ok: true,
    value: {
      employeeNumber,
      date,
      day: shortDayFromDate(date),
      weekStart: reconstructRdvWeek(date).weekStart,
      status,
      statusRaw: SCHEDULE_STATUS_LABELS[status],
      startTime: allowsHours ? startTime : null,
      endTime: allowsHours ? endTime : null
    }
  };
}

function normalizeTime(value: string | null | undefined): string | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return TIME_PATTERN.test(trimmed) ? trimmed : "INVALID";
}
