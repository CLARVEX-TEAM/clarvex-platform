// Helpers de solicitudes de cambio de turno / día libre.

export const SHIFT_TYPE_LABELS: Record<string, string> = {
  VACACIONES: "vacaciones",
  DESCANSO: "descanso",
  PAGO_DIA: "pago de día",
  SALIR_TEMPRANO: "salir temprano",
  ENTRAR_TARDE: "entrar tarde"
};

export const HOUR_TYPES = ["SALIR_TEMPRANO", "ENTRAR_TARDE"];

export function isHourType(type: string): boolean {
  return HOUR_TYPES.includes(type);
}

// Tipos de día completo que consumen un saldo en días (1 día por solicitud).
export type DayBalanceField = "vacationDays" | "paidDays";

export function dayBalanceField(type: string): DayBalanceField | null {
  if (type === "VACACIONES") return "vacationDays";
  if (type === "PAGO_DIA") return "paidDays";
  return null;
}

export const DAY_BALANCE_LABELS: Record<DayBalanceField, string> = {
  vacationDays: "vacaciones",
  paidDays: "pago de días"
};

export function formatRequestDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
