/**
 * Fechas en las que hay que reportar. Lógica pura y con tests: el objetivo de
 * todo esto es que nunca se te pase una entrega.
 *
 * - FALTAS: se reportan al supervisor cada quincena.
 * - RETARDOS, DOMINGOS y FESTIVOS: se capturan en Blitz ANTES del último sábado
 *   del mes.
 */

/** Último sábado del mes de una fecha. */
export function lastSaturdayOfMonth(year: number, month: number): Date {
  // Día 0 del mes siguiente = último día de este mes.
  const last = new Date(Date.UTC(year, month + 1, 0));
  const back = (last.getUTCDay() - 6 + 7) % 7; // días a retroceder hasta sábado
  return new Date(Date.UTC(year, month + 1, 0 - back));
}

export type Reminder = {
  kind: "QUINCENA" | "MES";
  /** Días que faltan para la entrega (0 = hoy). */
  daysLeft: number;
  message: string;
};

/**
 * ¿Toca avisar hoy? Se avisa 3 días antes y el mismo día — ni antes (se ignora)
 * ni después (ya no sirve de nada).
 */
export function reminderFor(today: Date): Reminder | null {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();

  // Mensual: antes del último sábado.
  const saturday = lastSaturdayOfMonth(year, month);
  const daysToSaturday = Math.round((saturday.getTime() - today.getTime()) / 86_400_000);
  if (daysToSaturday >= 0 && daysToSaturday <= 3) {
    const when = daysToSaturday === 0 ? "es HOY" : `es en ${daysToSaturday} día${daysToSaturday === 1 ? "" : "s"}`;
    return {
      kind: "MES",
      daysLeft: daysToSaturday,
      message: `El último sábado ${when} (${saturday.getUTCDate()}). Captura en Blitz los retardos, domingos y festivos del mes.`
    };
  }

  // Quincenal: faltas. Se avisa el 15 y el último día del mes.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day === 15 || day === lastDay) {
    return {
      kind: "QUINCENA",
      daysLeft: 0,
      message: "Cierre de quincena: reporta las faltas del periodo a tu supervisor."
    };
  }

  return null;
}
