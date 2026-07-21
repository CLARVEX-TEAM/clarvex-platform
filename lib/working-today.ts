/**
 * ¿Quién descansa HOY?
 *
 * La fuente de verdad es el archivo de HORARIOS (tabla Schedule), no la meta
 * diaria del RDV. Son dos archivos distintos: al reasignar un turno entre
 * asesores (uno pasa a descansar, el otro lo cubre) el RDV puede seguir
 * asignándole meta a quien ya descansa. El ranking creía que trabajaba y lo
 * subía al podio.
 *
 * Si la tienda no tiene horario cargado para ese día, se cae al heurístico
 * anterior (sin fila de KPI o meta 0 = descanso) para no romper a quien todavía
 * no vincula el archivo de horarios.
 */

type ShiftLike = { userId: string; date: string; status: string };
type KpiLike = { dailyGoal?: number | null } | undefined;

/** Estatus de horario de cada usuario para un día ("YYYY-MM-DD"). */
export function scheduleStatusByUser(shifts: ShiftLike[], dateKey: string): Map<string, string> {
  return new Map(shifts.filter((shift) => shift.date === dateKey).map((shift) => [shift.userId, shift.status]));
}

export function isRestingToday(scheduledStatus: string | undefined, kpi: KpiLike): boolean {
  if (scheduledStatus) return scheduledStatus !== "WORKING";
  return !kpi || (kpi.dailyGoal ?? 0) === 0;
}

/**
 * Etiqueta legible para quien queda FUERA del podio de ventas hoy.
 *
 * No todos los que salen del ranking "descansan": conteo, vacaciones, pago de
 * día y baja también quedan fuera (no tienen venta que rankear) pero mostrarlos
 * a todos como "Descanso" confunde al gerente, porque en el archivo de HORARIOS
 * aparecen con su estatus real. La fuente es el mismo Schedule.status.
 *
 * `withToday` agrega el sufijo "hoy" al descanso (subtítulo del ranking móvil);
 * en un chip corto (escritorio) se deja sin sufijo.
 */
export function restLabel(scheduledStatus: string | undefined, withToday = false): string {
  switch (scheduledStatus) {
    case "VACATION": return "Vacaciones";
    case "PAID_DAY": return "Pago de día";
    case "INVENTORY": return "Conteo";
    case "TERMINATED": return "Baja";
    default: return withToday ? "Descanso hoy" : "Descanso"; // OFF o sin horario (heurístico)
  }
}
