import { toMinutes } from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/attendance";

/**
 * Banco de horas: cuántas horas se le deben a alguien (o cuántas debe).
 *
 * Replica la fórmula de la hoja CONTROL HORAS, para no cambiar las reglas por
 * accidente al migrar del Excel a la app:
 *
 *   saldo = (entrada_esperada − entrada_real) + (salida_real − salida_esperada)
 *
 * Con el horario estándar de 10:30 a 21:00:
 *
 *   Entra 8:00,  sale 21:00 →  +2:30  (se le deben 2½ h)
 *   Entra 10:30, sale 19:00 →  −2:00  (debe 2 h)
 *   Entra 11:00, sale 21:00 →  −0:30  (llegó tarde: resta)
 *   Entra 10:30, sale 22:00 →  +1:00  (se quedó más: suma)
 *
 * Positivo = a favor del colaborador (la tienda le debe horas).
 *
 * Cada parte se cuenta SOLO si se capturó. Si no marcó salida, no se le castiga
 * con un saldo negativo enorme — igual que en el Excel, que exige ISNUMBER().
 */

export const DEFAULT_ENTRY = "10:30";
export const DEFAULT_EXIT = "21:00";

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
  if (arrived !== null) balance += expectedEntry - arrived; // antes = suma, tarde = resta
  if (left !== null) balance += left - expectedExit;        // se queda = suma, se va = resta
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
