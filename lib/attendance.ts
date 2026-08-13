/**
 * Reglas de asistencia: a tiempo, retardo o falta.
 *
 * Política de la tienda (San Agustín, jul-2026):
 *
 *   esperada = el horario del día del colaborador (Schedule.startTime).
 *              Si el archivo de horarios no trae hora, se usa la entrada
 *              esperada de la tienda (10:30 por defecto).
 *
 *   ≤ esperada + 14 min   → A TIEMPO   (llegar temprano también cuenta aquí)
 *   +15 a +29 min         → RETARDO    (no mueve el banco de horas)
 *   ≥ esperada + 30 min   → PERMISO DE ENTRADA TARDE (descuenta del banco)
 *
 * La regla es RELATIVA al horario de cada quien: quien entra a las 13:00 tiene
 * su retardo de 13:15 a 13:29, y desde las 13:30 se considera entrada tarde
 * con permiso. No es una hora fija.
 *
 * Excepción: si el colaborador tenía un permiso de ENTRAR_TARDE aprobado para
 * ese día, no cuenta ni como retardo ni como falta.
 *
 * Ojo: esto alimenta reportes de nómina. Un minuto mal clasificado le cuesta
 * dinero a una persona, así que la lógica vive aquí sola y con tests.
 */

export type AttendanceStatus =
  | "ON_TIME"    // llegó dentro de la tolerancia (o antes)
  | "LATE"       // retardo
  | "ABSENT"     // falta: no llegó, o la captura declara FALTA explícitamente
  | "EXCUSED"    // permiso de entrar tarde: no es retardo y usa banco de horas
  | "REST"       // descanso
  | "VACATION"
  | "PAID_DAY"
  | "INVENTORY";

/** Minutos de gracia antes de que cuente como retardo. */
export const TOLERANCE_MINUTES = 14;
/** A partir de aquí la llegada se trata como permiso y usa el banco de horas. */
export const CUTOFF_MINUTES = 30;
/** Entrada esperada de la tienda cuando el horario del día no trae hora. */
export const DEFAULT_EXPECTED_ENTRY = "10:30";

/** "10:45" → 645. Devuelve null si no es una hora válida. */
export function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export type ArrivalInput = {
  /** Hora que debía entrar ("10:30"). */
  expected: string;
  /** Hora que marcó en el POS ("10:45"). null = no marcó entrada. */
  arrived: string | null;
  /** Tenía permiso aprobado para entrar tarde ese día. */
  excused?: boolean;
  toleranceMinutes?: number;
  cutoffMinutes?: number;
};

export type ArrivalResult = {
  status: AttendanceStatus;
  /** Diferencia contra su horario. Negativo = llegó antes. */
  minutesLate: number;
};

export function classifyArrival(input: ArrivalInput): ArrivalResult {
  const tolerance = input.toleranceMinutes ?? TOLERANCE_MINUTES;
  const cutoff = input.cutoffMinutes ?? CUTOFF_MINUTES;

  // El permiso gana sobre todo lo demás, incluso si no marcó entrada.
  if (input.excused) return { status: "EXCUSED", minutesLate: 0 };

  const expected = toMinutes(input.expected);
  const arrived = toMinutes(input.arrived);

  // Sin marca de entrada = no se presentó.
  if (arrived === null) return { status: "ABSENT", minutesLate: 0 };

  // Sin hora esperada no se puede juzgar: se registra la llegada sin castigo.
  if (expected === null) return { status: "ON_TIME", minutesLate: 0 };

  const minutesLate = arrived - expected;

  if (minutesLate <= tolerance) return { status: "ON_TIME", minutesLate };
  if (minutesLate < cutoff) return { status: "LATE", minutesLate };
  // Desde el corte ya no es retardo: es un permiso de entrada tarde y los
  // minutos completos se descuentan del banco de horas.
  return { status: "EXCUSED", minutesLate };
}

/** Estos estatus significan que la persona no tenía que presentarse. */
export function isNonWorkingStatus(status: AttendanceStatus): boolean {
  return status === "REST" || status === "VACATION" || status === "PAID_DAY" || status === "INVENTORY";
}

/** Estatus del día según el archivo de HORARIOS (tabla Schedule). */
export type ScheduledStatus = "WORKING" | "OFF" | "VACATION" | "PAID_DAY" | "INVENTORY" | "TERMINATED";

const SCHEDULED_TO_ATTENDANCE: Record<Exclude<ScheduledStatus, "WORKING">, AttendanceStatus> = {
  OFF: "REST",
  VACATION: "VACATION",
  PAID_DAY: "PAID_DAY",
  INVENTORY: "INVENTORY",
  TERMINATED: "REST"
};

/** Textos de la celda ENTRADA que declaran directamente el estatus del día. */
const TEXT_TO_ATTENDANCE: Record<string, AttendanceStatus> = {
  FALTA: "ABSENT",
  VACACIONES: "VACATION",
  DESCANSO: "REST",
  DESC: "REST",
  PAGO: "PAID_DAY",
  "PAGO DIA": "PAID_DAY",
  "PAGO DÍA": "PAID_DAY",
  CONTEO: "INVENTORY"
};

/**
 * El estatus del día ya lo decidió el horario o el texto de la celda. Solo el
 * CONTEO necesita además medir la llegada: es día laborable y sí tiene retardos
 * (ver `countsAsLate`). Al resto —descanso, vacaciones, pago de día— no hay nada
 * que medirle: no tenían que presentarse.
 */
function withDayStatus(status: AttendanceStatus, input: ArrivalInput): ArrivalResult {
  if (status !== "INVENTORY") return { status, minutesLate: 0 };
  const expected = toMinutes(input.expected);
  const arrived = toMinutes(input.arrived);
  if (expected === null || arrived === null) return { status, minutesLate: 0 };
  return { status, minutesLate: arrived - expected };
}

export type DayInput = ArrivalInput & {
  /** Lo que dice el archivo de HORARIOS para ese día. null si no hay horario cargado. */
  scheduled: ScheduledStatus | null;
  /** Texto de la celda ENTRADA cuando no era una hora ("VACACIONES", "FALTA"). */
  entryText?: string | null;
};

/**
 * Estatus del día completo, cruzando la captura de asistencia con el horario.
 *
 * ⚠️ Por qué es indispensable cruzar con el horario:
 *
 * En la hoja APERTURA, una celda de entrada VACÍA significa dos cosas muy
 * distintas: "no se presentó" o "no le tocaba trabajar". La hoja no las
 * distingue. Si se guardara tal cual, a quien descansó se le anotaría una FALTA
 * — y las faltas se reportan a nómina.
 *
 * La app sí sabe quién descansaba (tabla Schedule), así que aquí se cruzan.
 */
export function classifyDay(input: DayInput): ArrivalResult {
  // 1. El texto explícito de la celda manda: si escribieron "FALTA", es falta,
  //    aunque el horario dijera otra cosa.
  const text = input.entryText?.trim().toUpperCase();
  if (text && TEXT_TO_ATTENDANCE[text]) {
    return withDayStatus(TEXT_TO_ATTENDANCE[text], input);
  }

  // 2. Si el horario dice que NO le tocaba trabajar, no hay nada que juzgar.
  //    Esto es lo que evita las faltas falsas de quien descansa.
  if (input.scheduled && input.scheduled !== "WORKING") {
    return withDayStatus(SCHEDULED_TO_ATTENDANCE[input.scheduled], input);
  }

  // 3. Le tocaba trabajar (o no hay horario cargado): se juzga la llegada.
  return classifyArrival(input);
}

/** Cuenta para el reporte quincenal de faltas. */
export function countsAsAbsence(status: AttendanceStatus): boolean {
  return status === "ABSENT";
}

/**
 * Cuenta para el reporte mensual de retardos.
 *
 * ⚠️ El CONTEO también tiene retardos. Es día laborable: llegar tarde es llegar
 * tarde, y se reporta igual que cualquier otro día. Lo que el conteo NO tiene es
 * FALTA — a nadie se le regresa a casa ese día —, así que pasado el corte deja
 * de ser retardo: ahí la jornada sí cambió de verdad (entrar a las 13:00 es un
 * acuerdo, no una llegada tarde) y se ajusta contra el banco de horas.
 * Ver `entryCredit` en lib/hours-balance.ts, que parte las bandas igual.
 */
export function countsAsLate(day: { status: AttendanceStatus; minutesLate: number }): boolean {
  if (day.status === "LATE") return true;
  return day.status === "INVENTORY"
    && day.minutesLate > TOLERANCE_MINUTES
    && day.minutesLate < CUTOFF_MINUTES;
}

/** Prima dominical: la gana quien TRABAJÓ un domingo (no quien descansó). */
export function earnsSundayPremium(status: AttendanceStatus, date: Date): boolean {
  if (date.getUTCDay() !== 0) return false;
  return status === "ON_TIME" || status === "LATE" || status === "EXCUSED";
}
