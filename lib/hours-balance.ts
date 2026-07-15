import { TOLERANCE_MINUTES, toMinutes } from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/attendance";

/**
 * Banco de horas: cuántas horas se le deben a alguien (o cuántas debe).
 *
 *   saldo = (entrada_esperada − entrada_real) + (salida_real − salida_esperada)
 *
 * Con el horario estándar de 10:30 a 21:00:
 *
 *   Entra 8:00,  sale 21:00 →  +2:30  (se le deben 2½ h)
 *   Entra 10:30, sale 19:00 →  −2:00  (debe 2 h)
 *   Entra 11:00, sale 21:00 →  −0:30  (pidió entrar tarde: resta)
 *   Entra 10:30, sale 22:00 →  +1:00  (se quedó más: suma)
 *
 * Positivo = a favor del colaborador (la tienda le debe horas).
 *
 * ⚠️ DENTRO DE LA TOLERANCIA EL SALDO NO SE MUEVE. Llegar 10:36 no es "deber 6
 * minutos": es llegar a tiempo, y así lo clasifica el resto de la app. El banco
 * de horas es para jornadas que de verdad cambiaron (pidió entrar a las 11, se
 * fue a las 19:00, entró a las 8:00), no para el ruido de marcar unos minutos
 * antes o después. Contarlo generaba saldos negativos por gente puntual.
 *
 * Cuando SÍ se sale de la tolerancia se cuenta la desviación COMPLETA: quien
 * entra a las 11:00 debe 30 minutos, no 16.
 *
 * ⚠️ ENTRADAS ADELANTADAS: la entrada estándar es 10:30, pero a veces se abre
 * antes a una hora cerrada (7, 8, 9, 10). La tolerancia también aplica ahí:
 * llegar 8:11 cuenta como haber entrado a las 8:00, así que el crédito es +2:30
 * (10:30 − 8:00), no +2:19. Se redondea la llegada temprana a su hora en punto
 * cuando cae dentro de la tolerancia después de ella. La entrada TARDE (después
 * de 10:30) no se redondea: eso es un descuento real.
 *
 * Cada parte se cuenta SOLO si se capturó. Si no marcó salida, no se le castiga
 * con un saldo negativo enorme — igual que en el Excel, que exige ISNUMBER().
 */

export const DEFAULT_ENTRY = "10:30";
export const DEFAULT_EXIT = "21:00";

// Las entradas adelantadas se piden a horas cerradas (7:00, 8:00…). El banco
// redondea la llegada a esa cuadrícula de 30 min cuando cae dentro de tolerancia.
const ENTRY_GRID_MINUTES = 30;

/** Desviaciones de minutos sueltos no mueven el banco de horas. */
function beyondTolerance(deviation: number): number {
  return Math.abs(deviation) <= TOLERANCE_MINUTES ? 0 : deviation;
}

/**
 * Crédito de la ENTRADA, con la tolerancia aplicada a la hora en punto prevista.
 * Positivo = entró antes del estándar (suma). Negativo = entró tarde (resta).
 */
function entryCredit(expectedEntry: number, arrived: number): number {
  // Dentro de la tolerancia del estándar: no mueve el banco.
  if (Math.abs(expectedEntry - arrived) <= TOLERANCE_MINUTES) return 0;
  // Entrada adelantada: se redondea a su hora en punto (8:11 → 8:00) si llegó
  // dentro de la tolerancia después de ella. Así el crédito es completo.
  if (arrived < expectedEntry) {
    const pastBoundary = arrived % ENTRY_GRID_MINUTES;
    const effectiveArrival = pastBoundary <= TOLERANCE_MINUTES ? arrived - pastBoundary : arrived;
    return expectedEntry - effectiveArrival;
  }
  // Entrada tarde: descuento real, sin redondeo.
  return expectedEntry - arrived;
}

/** Días en los que no se esperaba a la persona: no generan saldo. */
function offDay(status: AttendanceStatus): boolean {
  return status === "REST" || status === "VACATION" || status === "PAID_DAY"
    || status === "INVENTORY" || status === "ABSENT";
}

export type DayBalanceInput = {
  status: AttendanceStatus;
  expectedEntry?: string | null;
  expectedExit?: string | null;
  arrivedAt: string | null;
  leftAt: string | null;
};

/** Saldo del día EN MINUTOS. Positivo = a favor del colaborador. */
export function dayBalanceMinutes(input: DayBalanceInput): number {
  // Descanso, vacaciones o falta: no hay jornada que comparar.
  if (offDay(input.status)) return 0;

  const expectedEntry = toMinutes(input.expectedEntry ?? DEFAULT_ENTRY) ?? toMinutes(DEFAULT_ENTRY)!;
  const expectedExit = toMinutes(input.expectedExit ?? DEFAULT_EXIT) ?? toMinutes(DEFAULT_EXIT)!;
  const arrived = toMinutes(input.arrivedAt);
  const left = toMinutes(input.leftAt);

  let balance = 0;
  if (arrived !== null) balance += entryCredit(expectedEntry, arrived); // antes = suma (redondeada), tarde = resta
  if (left !== null) balance += beyondTolerance(left - expectedExit);   // se queda = suma, se va = resta
  return balance;
}

/** Suma de saldos, en minutos. */
export function totalBalanceMinutes(days: DayBalanceInput[]): number {
  return days.reduce((total, day) => total + dayBalanceMinutes(day), 0);
}

/**
 * Minutos → "+2:30" / "−0:45" / "+0:00".
 * Mismo formato que la hoja CONTROL HORAS, para que se puedan comparar de un
 * vistazo mientras conviven el Excel y la app.
 */
export function formatBalance(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return `${sign}${hours}:${String(rest).padStart(2, "0")}`;
}
