/** Horario en que los avisos que esperan --metas, horarios, cierre-- pueden salir. */
export const HORARIO_DE_AVISOS = { desde: 8, hasta: 21 };

/**
 * ¿Es hora de mandar avisos? De 8 am a 9 pm de Monterrey.
 *
 * ⚠️ Los avisos semanales corren cada 15 minutos o cada hora TODO el día. A
 * medianoche cambia la semana o empieza el día laboral de alguien que estaba
 * descansando, y sin esta guarda el aviso le llegaba a las 12 de la noche.
 * Fuera de horario no se manda ni se registra: sale en la primera vuelta de las 8.
 */
export function enHorarioDeAvisos(ahora: Date = new Date()): boolean {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Monterrey", hour: "numeric", hourCycle: "h23" }).format(ahora));
  return hora >= HORARIO_DE_AVISOS.desde && hora < HORARIO_DE_AVISOS.hasta;
}
