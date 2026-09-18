export const AXO_ATTENDANCE_DUE_MINUTES = 11 * 60;

/** Una confirmación por tienda y día; ReportDelivery ya garantiza unicidad. */
/**
 * Quién puede ver la asistencia de AXO y declarar que se envió el Forms.
 *
 * ⚠️ **El KIOSKO entra, y es deliberado.** El celular de la tienda
 * (`checklistOnly`) está encerrado a propósito —solo checklist— pero es el
 * aparato que está A LA MANO cuando se abre la tienda a las 10:30, que es
 * justo cuando hay que pasar la lista al Forms. Pedirle a gerencia que saque su
 * teléfono personal para eso es lo que hace que la tarea se pase por alto.
 *
 * ⚠️ **NO se abre a los asesores.** El kiosko tiene rol `ASESOR`, así que
 * abrirlo por rol se lo daría a todo el equipo. Por eso la condición mira
 * `checklistOnly` y no el puesto.
 *
 * ⚠️ Y lo que queda escrito en la auditoría cambia: `confirmedById` guardará al
 * usuario kiosko, o sea «lo confirmó el aparato de la tienda», no una persona.
 * Sigue siendo trazable y sigue siendo una DECLARACIÓN —Clarvex no puede
 * comprobar que Microsoft lo recibió— pero no atribuye a nadie en concreto.
 */
export function puedeConAsistenciaAxo(session: {
  role: string;
  checklistOnly?: boolean;
  platformAdmin?: boolean;
}): boolean {
  if (session.platformAdmin) return true;
  if (session.role === "GERENTE" || session.role === "SUBGERENTE") return true;
  return session.checklistOnly === true;
}

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
