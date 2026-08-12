/**
 * Validación de una fila de asistencia capturada a mano.
 *
 * Vive aparte de `lib/attendance-capture` porque ese módulo importa Prisma, y
 * `lib/prisma` lanza en el entorno de pruebas para que ningún test unitario
 * toque una base real.
 *
 * ⚠️ Aquí NO se decide el estado del día. `status`, `minutesLate` y
 * `minutesBalance` los calculan `classifyDay` y `dayBalanceMinutes` a partir
 * del horario, igual que hace el importador. Dejar que la pantalla mandara un
 * estado abriría la puerta a marcar "a tiempo" una llegada tarde.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Textos admitidos en la columna de entrada cuando no hubo hora. */
export const ENTRY_TEXTS = ["VACACIONES", "FALTA", "DESCANSO", "PAGO DIA", "CONTEO", "INCAPACIDAD", "PERMISO"] as const;

export type AttendanceCaptureEntry = {
  employeeNumber: string;
  date: string;
  arrivedAt?: string | null;
  lunchStart?: string | null;
  leftAt?: string | null;
  entryText?: string | null;
  note?: string | null;
};

export type NormalizedAttendanceEntry = {
  employeeNumber: string;
  date: Date;
  arrivedAt: string | null;
  lunchStart: string | null;
  leftAt: string | null;
  entryText: string | null;
  note: string | null;
};

export type NormalizeAttendanceOutcome =
  | { ok: true; value: NormalizedAttendanceEntry }
  | { ok: false; error: string };

export function normalizeAttendanceEntry(entry: AttendanceCaptureEntry): NormalizeAttendanceOutcome {
  const employeeNumber = String(entry.employeeNumber ?? "").trim();
  if (!employeeNumber) return { ok: false, error: "Falta el número de empleado." };

  if (!DATE_PATTERN.test(entry.date ?? "")) {
    return { ok: false, error: `Fecha inválida en ${employeeNumber}: se espera AAAA-MM-DD.` };
  }
  const date = new Date(`${entry.date}T00:00:00.000Z`);
  // `new Date("2026-02-31")` no falla: desborda a marzo.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) {
    return { ok: false, error: `Fecha inexistente en ${employeeNumber}: ${entry.date}.` };
  }

  const times: Record<string, string | null> = {};
  for (const field of ["arrivedAt", "lunchStart", "leftAt"] as const) {
    const normalized = normalizeTime(entry[field]);
    if (normalized === "INVALID") {
      return { ok: false, error: `Hora inválida en ${employeeNumber} (${entry.date}), campo ${field}: se espera HH:MM.` };
    }
    times[field] = normalized;
  }

  const entryText = normalizeText(entry.entryText);
  if (entryText && !ENTRY_TEXTS.includes(entryText as (typeof ENTRY_TEXTS)[number])) {
    return {
      ok: false,
      error: `Texto de entrada no reconocido en ${employeeNumber} (${entry.date}): ${entryText}. Válidos: ${ENTRY_TEXTS.join(", ")}.`
    };
  }
  // Una hora de entrada y un texto como VACACIONES se contradicen: o vino, o no.
  if (times.arrivedAt && entryText) {
    return {
      ok: false,
      error: `${employeeNumber} (${entry.date}) trae hora de entrada y además "${entryText}". Solo uno de los dos.`
    };
  }
  if (times.leftAt && times.arrivedAt && times.leftAt <= times.arrivedAt) {
    return { ok: false, error: `${employeeNumber} (${entry.date}): la salida no puede ser anterior o igual a la entrada.` };
  }

  return {
    ok: true,
    value: {
      employeeNumber,
      date,
      arrivedAt: times.arrivedAt,
      lunchStart: times.lunchStart,
      leftAt: times.leftAt,
      entryText,
      // La nota es texto libre de gerencia: se respeta tal cual la escribieron.
      note: normalizeNote(entry.note)
    }
  };
}

function normalizeNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().slice(0, 300);
  return trimmed || null;
}

function normalizeTime(value: string | null | undefined): string | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return TIME_PATTERN.test(trimmed) ? trimmed : "INVALID";
}

/** El texto de entrada es un token cerrado, así que se compara en mayúsculas. */
function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().slice(0, 40);
  return trimmed ? trimmed.toUpperCase() : null;
}
