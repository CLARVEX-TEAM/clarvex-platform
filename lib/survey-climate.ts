/**
 * Índice de clima y semáforo por pregunta.
 *
 * Sin Prisma a propósito: son cuentas sobre promedios, y así se prueban sin
 * base de datos.
 */

/** A quién va dirigida una encuesta. */
export type SurveyAudience = "ALL" | "ADVISORS";

export const AUDIENCE_LABEL: Record<SurveyAudience, string> = {
  ALL: "Todo el equipo",
  ADVISORS: "Solo asesores"
};

/**
 * Índice de clima, de 0 a 100.
 *
 * Es el promedio de TODAS las respuestas de escala, reescalado: un 1 vale 0 y
 * un 5 vale 100. Se reescala porque en una escala de 1 a 5 el mínimo es 1, no
 * 0: presentar un 1 como «20 de 100» diría que algo se está haciendo bien
 * cuando es la peor calificación posible.
 *
 * Pondera por RESPUESTA y no por pregunta: si una pregunta la contestaron
 * cuatro personas y otra solo dos, la primera pesa el doble, que es lo honesto.
 */
export function climateIndex(questions: Array<{ average: number | null; count: number }>): number | null {
  let weighted = 0;
  let total = 0;
  for (const question of questions) {
    if (question.average === null || question.count <= 0) continue;
    weighted += question.average * question.count;
    total += question.count;
  }
  if (total === 0) return null;
  const average = weighted / total;
  return Math.round(((average - 1) / 4) * 100);
}

export type ClimateLevel = "bueno" | "atencion" | "critico" | "sin-dato";

/**
 * Semáforo de un promedio de 1 a 5.
 *
 * Los cortes (4.0 y 3.0) son los de uso común en encuestas de clima con escala
 * de cinco. No son una ley: son un punto de partida razonable para no tener que
 * interpretar veinte números a mano.
 *
 * Un 3 sobre 5 NO es «regular tirando a bien». En clima laboral, la gente
 * marca el punto medio cuando no quiere decir que está mal, así que la franja
 * de atención empieza justo ahí.
 */
export function ratingLevel(average: number | null): ClimateLevel {
  if (average === null) return "sin-dato";
  if (average >= 4) return "bueno";
  if (average >= 3) return "atencion";
  return "critico";
}

/** El mismo semáforo pero sobre el índice de 0 a 100. */
export function indexLevel(index: number | null): ClimateLevel {
  if (index === null) return "sin-dato";
  return ratingLevel(1 + (index / 100) * 4);
}

export const LEVEL_LABEL: Record<ClimateLevel, string> = {
  bueno: "Bien",
  atencion: "Atención",
  critico: "Crítico",
  "sin-dato": "Sin datos"
};

/**
 * Qué tan repartidas están las respuestas (desviación típica poblacional).
 *
 * Con cinco personas el promedio engaña: «todos pusieron 3» y «dos pusieron 5 y
 * tres pusieron 1» dan casi la misma media y son situaciones opuestas. Por
 * encima de ~1.2 el equipo está partido y el promedio no representa a nadie.
 */
export function spread(distribution: number[]): number | null {
  const total = distribution.reduce((sum, value) => sum + value, 0);
  if (total === 0) return null;
  const mean = distribution.reduce((sum, count, index) => sum + count * (index + 1), 0) / total;
  const variance = distribution.reduce((sum, count, index) => sum + count * (index + 1 - mean) ** 2, 0) / total;
  return Math.sqrt(variance);
}

/** ¿El equipo está dividido en esta pregunta? */
export function isSplit(distribution: number[]): boolean {
  const value = spread(distribution);
  return value !== null && value >= 1.2;
}

/** Preguntas que peor salieron, para saber por dónde empezar. */
export function worstQuestions<T extends { average: number | null; count: number }>(questions: T[], take = 3): T[] {
  return questions
    .filter((question) => question.average !== null && question.count > 0)
    .sort((a, b) => (a.average ?? 5) - (b.average ?? 5))
    .slice(0, take);
}

/** Tasa de respuesta en porcentaje. `null` si no hay a quién preguntarle. */
export function responseRate(responses: number, recipients: number): number | null {
  if (recipients <= 0) return null;
  return Math.round((responses / recipients) * 100);
}
