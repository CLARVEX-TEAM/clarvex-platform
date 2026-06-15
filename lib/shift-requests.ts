// Helpers de solicitudes de cambio de turno / día libre.

export const SHIFT_TYPE_LABELS: Record<string, string> = {
  VACACIONES: "vacaciones",
  DESCANSO: "descanso",
  PAGO_DIA: "pago de día"
};

export function formatRequestDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
