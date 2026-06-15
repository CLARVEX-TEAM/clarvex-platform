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

export function formatRequestDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
