/**
 * Pago de días: el derecho que se gana cuando una semana se descansa de menos.
 *
 * En tienda se descansan **dos días por semana**. La semana que alguien descansa
 * uno solo, la tienda le queda a deber ese día, y ese saldo se cobra después como
 * «pago de día».
 *
 * Antes era un número a mano en la ficha de cada quien, con el mismo problema que
 * tenían las vacaciones y las horas: nadie se acuerda de subirlo cada semana, y el
 * número se desfasa callado hasta que alguien reclama.
 *
 * Aquí solo vive el cálculo, sin base de datos, para poder probarlo.
 */

/** Descansos que corresponden a una semana completa. */
export const RESTS_PER_WEEK = 2;

export type WeekDay = {
  /** Domingo de la semana a la que pertenece, en `YYYY-MM-DD`. */
  week: string;
  status: string;
};

/**
 * Días de pago ganados en una semana.
 *
 * ⚠️ Solo cuentan las semanas en las que la persona **trabajó al menos un día**.
 * Una semana entera de vacaciones o de incapacidad no genera descansos que
 * reponer: no hubo jornada que descansar. Una semana mixta sí — si tomó
 * vacaciones y aun así descansó un solo día, el segundo descanso se le debe.
 *
 * Los días de pago que se toman NO se restan aquí: se cuentan aparte, porque un
 * `PAGO_DIA` es consumo del saldo, no un descanso de la semana.
 */
export function paidDaysEarnedInWeek(statuses: string[]): number {
  const worked = statuses.filter((status) => status === "WORKING" || status === "INVENTORY").length;
  if (worked === 0) return 0;

  const rests = statuses.filter((status) => status === "OFF").length;
  return Math.max(0, RESTS_PER_WEEK - rests);
}

/** Domingo de la semana que contiene la fecha, en `YYYY-MM-DD`. */
export function weekOf(date: Date): string {
  const sunday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  return sunday.toISOString().slice(0, 10);
}

/**
 * Días ganados por persona, agrupando sus días por semana.
 *
 * ⚠️ Una semana INCOMPLETA no se cuenta. La semana en curso todavía puede recibir
 * un descanso el sábado, y darla por ganada el martes le sumaría un día que quizá
 * no le toca. Se exige que estén los siete días capturados.
 */
export function paidDaysEarned(days: WeekDay[]): number {
  const byWeek = new Map<string, string[]>();
  for (const day of days) {
    const bucket = byWeek.get(day.week);
    if (bucket) bucket.push(day.status);
    else byWeek.set(day.week, [day.status]);
  }

  let earned = 0;
  for (const statuses of Array.from(byWeek.values())) {
    if (statuses.length < 7) continue;
    earned += paidDaysEarnedInWeek(statuses);
  }
  return earned;
}
