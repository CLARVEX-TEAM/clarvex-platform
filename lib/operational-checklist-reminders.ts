export const AXO_ATTENDANCE_DUE_MINUTES = 11 * 60;

/** Una confirmación por tienda y día; ReportDelivery ya garantiza unicidad. */
export function axoAttendancePeriodKey(dateKey: string): string {
  return `AXO-DIARIO-${dateKey}`;
}

/** El control de energía se solicita lunes, miércoles y viernes. */
export function isEnergyChecklistDay(weekday: number): boolean {
  return weekday === 1 || weekday === 3 || weekday === 5;
}

export function attendanceDeadlineState(
  minutesOfDay: number,
  confirmedAt: Date | null
): "CONFIRMED" | "PENDING" | "OVERDUE" {
  if (confirmedAt) return "CONFIRMED";
  return minutesOfDay >= AXO_ATTENDANCE_DUE_MINUTES ? "OVERDUE" : "PENDING";
}

export function roleOrder(role: string): number {
  if (role === "GERENTE") return 0;
  if (role === "SUBGERENTE") return 1;
  if (role === "ASESOR") return 2;
  return 3;
}

export function roleLabel(role: string): string {
  if (role === "GERENTE") return "Gerente";
  if (role === "SUBGERENTE") return "Subgerente";
  if (role === "ASESOR") return "Asesor";
  return role;
}
