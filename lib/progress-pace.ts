/**
 * Marca de ritmo para las barras de progreso.
 *
 * El problema que resuelve: el cumplimiento se pintaba en rojo comparándolo
 * contra el 100% del periodo COMPLETO, sin mirar cuánto periodo había
 * transcurrido. El día 2 de un mes de cuatro semanas, un 33% salía en rojo
 * cuando en realidad iba POR DELANTE (lo esperado a esas alturas era ~25%). El
 * primer día de cada mes todo el mundo estaba «mal».
 *
 * La marca dice dónde deberías ir hoy. El color sale de compararte con ELLA, no
 * con el 100%.
 *
 * ⚠️ El ritmo es LINEAL, y la venta en retail no lo es: pesan más los fines de
 * semana, la quincena y el cierre de mes. Es una aproximación, pero es la misma
 * que ya usa la proyección de cierre, así que al menos las dos cuentan lo mismo.
 * Como referencia visual es mucho mejor que comparar contra el 100% desde el
 * día 1; como sentencia, no.
 *
 * Sin Prisma ni React: se prueba sin levantar nada.
 */

const DAY_MS = 86_400_000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Qué porcentaje del periodo ha transcurrido, de 0 a 100.
 *
 * Devuelve `null` cuando no hay ritmo que marcar:
 *  - el periodo ya cerró: entonces sí se juzga contra el 100%, que es la meta
 *    de verdad y ya no hay tiempo por delante;
 *  - el periodo aún no empieza.
 *
 * El día en curso CUENTA COMPLETO. Si no, a primera hora de la mañana la marca
 * saldría en el punto de ayer y cualquiera parecería ir por delante.
 */
export function periodElapsed(startDate: string, endDate: string, now = new Date()): number | null {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;

  const today = utcDay(now);
  if (today < start) return null;
  if (today > end) return null;

  const totalDays = (end - start) / DAY_MS + 1;
  const elapsedDays = (today - start) / DAY_MS + 1;
  return Math.round((elapsedDays / totalDays) * 100);
}

export type PaceStatus = "adelante" | "en-ritmo" | "atras" | "cumplida" | "sin-ritmo";

/** Margen en puntos alrededor de la marca que se considera «en ritmo». */
export const PACE_BAND = 5;

/**
 * Cómo vas respecto a la marca.
 *
 * Cuando el periodo ya cerró (`pace === null`) se compara contra el 100%: ahí la
 * pregunta deja de ser «¿voy a tiempo?» y pasa a ser «¿llegué?».
 */
export function paceStatus(progress: number | null, pace: number | null): PaceStatus {
  if (progress === null || progress === undefined) return "sin-ritmo";
  if (progress >= 100) return "cumplida";
  if (pace === null) return progress >= 90 ? "en-ritmo" : "atras";
  if (progress >= pace + PACE_BAND) return "adelante";
  if (progress >= pace - PACE_BAND) return "en-ritmo";
  return "atras";
}

/** Texto del estado. El color nunca va solo. */
export function paceLabel(status: PaceStatus, pace: number | null): string {
  switch (status) {
    case "cumplida":
      return "Meta cumplida";
    case "adelante":
      return pace === null ? "Por delante" : `Por delante del ritmo (${pace}% esperado)`;
    case "en-ritmo":
      return pace === null ? "Cerca de la meta" : `En ritmo (${pace}% esperado)`;
    case "atras":
      return pace === null ? "Bajo la meta" : `Detrás del ritmo (${pace}% esperado)`;
    default:
      return "";
  }
}

/**
 * Escala común de la barra y la marca.
 *
 * Si el valor pasa del 100% —la proyección de cierre suele ir al 130%— una barra
 * recortada a 100 se ve LLENA y deja de informar: siempre igual, pase lo que
 * pase. Escalando al mayor de los tres, el relleno crece y la marca de la meta
 * se queda atrás, que es exactamente lo que se quiere ver.
 */
export function scaleFor(value: number, marker: number | null): number {
  return Math.max(100, value, marker ?? 0);
}

/** Ancho del relleno en porcentaje del carril. */
export function fillWidth(value: number, marker: number | null): number {
  const scale = scaleFor(value, marker);
  return Math.max(0, Math.min(100, (Math.max(0, value) / scale) * 100));
}

/** Posición de la marca en porcentaje del carril. `null` si no hay que pintarla. */
export function markerPosition(value: number, marker: number | null): number | null {
  if (marker === null || marker === undefined) return null;
  const scale = scaleFor(value, marker);
  const position = (marker / scale) * 100;
  // Pegada a los extremos no se distingue del borde del carril.
  return position <= 1 || position >= 99 ? null : position;
}
