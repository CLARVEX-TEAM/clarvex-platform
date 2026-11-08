const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function shouldSendShiftReminder(startTime: string | null, nowMinutes: number): boolean {
  const start = timeToMinutes(startTime);
  if (start === null || !Number.isInteger(nowMinutes)) return false;
  const minutesUntilStart = start - nowMinutes;
  return minutesUntilStart >= 45 && minutesUntilStart <= 75;
}

export function shiftReminderText(startTime: string, zone: string | null): { title: string; body: string } {
  return {
    title: `Tu turno empieza a las ${startTime}`,
    body: zone ? `Prepárate para tu jornada. Hoy estarás en ${zone}.` : "Prepárate para tu jornada y revisa los detalles en Mi día."
  };
}

/**
 * Quién recibe el recordatorio de turno: solo asesores.
 *
 * ⚠️ Gerencia no (8 nov 2026, a petición de Adrián): conoce su horario y ya le
 * llegan los avisos de AXO y el arranque del día a la misma hora. El aviso de
 * turno era un mensaje más en una mañana que ya traía seis.
 */
export const ROLES_CON_RECORDATORIO_DE_TURNO = ["ASESOR"] as const;
