/**
 * Vacaciones: derecho por antigüedad, según la LFT.
 *
 * Art. 76 (reforma de 2023, "Ley de Vacaciones Dignas"): al CUMPLIR un año de
 * servicio se ganan 12 días. Cada año siguiente suma 2 más hasta llegar a 20 (al
 * quinto año). A partir del sexto, sube 2 días por cada 5 años de servicio.
 *
 *   1 año  → 12      6-10 años  → 22
 *   2 años → 14     11-15 años  → 24
 *   3 años → 16     16-20 años  → 26
 *   4 años → 18     21-25 años  → 28
 *   5 años → 20     26-30 años  → 30
 *
 * El derecho se GANA EN EL ANIVERSARIO, no se va acumulando día a día. Por eso
 * todo aquí gira alrededor de las fechas de aniversario y no de proporciones.
 *
 * Ojo: esto calcula el derecho de ley. Si la tienda da más días que la ley, el
 * extra se captura como ajuste manual — este archivo no lo inventa.
 */

/**
 * ¿Este día de vacaciones ya se DISFRUTÓ (y por tanto se descuenta)?
 *
 * Un día se descuenta cuando se vivió, no cuando se planeó. En Horarios se
 * capturan vacaciones futuras con semanas de anticipación: descontarlas de una vez
 * le quitaría al asesor días que todavía no ha tomado — y si el plan cambia, se le
 * quitaron por nada.
 *
 * `since` es la fecha de corte del saldo capturado: lo anterior ya está descontado.
 */
export function isVacationTaken(date: Date, since: Date, today: Date): boolean {
  return date.getTime() > since.getTime() && date.getTime() < today.getTime();
}

/** Ya capturado en Horarios pero todavía por venir. Informa; no descuenta. */
export function isVacationPlanned(date: Date, today: Date): boolean {
  return date.getTime() >= today.getTime();
}

export type VacationDayRow = { userId: string; date: Date };

/**
 * Reparte los días de vacaciones en tomados (ya pasaron) y programados (por venir).
 *
 * Vive aquí, y no en `vacation-account`, porque este módulo no toca la base: así
 * la regla — la parte delicada del cálculo — se puede probar sola. Metida dentro
 * de una consulta SQL no habría forma.
 *
 * La asistencia manda y el horario es el respaldo; un día que aparece en las dos
 * fuentes no puede contar doble, por eso se agrupa por fecha.
 */
export function splitVacationDays(
  rows: VacationDayRow[],
  since: Date,
  today: Date
): Map<string, { taken: number; planned: number }> {
  const takenByUser = new Map<string, Set<string>>();
  const plannedByUser = new Map<string, Set<string>>();

  for (const row of rows) {
    const bucket = isVacationTaken(row.date, since, today) ? takenByUser
      : isVacationPlanned(row.date, today) ? plannedByUser
      : null; // anterior al corte: ya está descontado dentro del saldo capturado
    if (!bucket) continue;
    const key = row.date.toISOString().slice(0, 10);
    const days = bucket.get(row.userId) ?? new Set<string>();
    days.add(key);
    bucket.set(row.userId, days);
  }

  const userIds = new Set([...takenByUser.keys(), ...plannedByUser.keys()]);
  return new Map(Array.from(userIds, (userId) => [userId, {
    taken: takenByUser.get(userId)?.size ?? 0,
    planned: plannedByUser.get(userId)?.size ?? 0
  }]));
}

/** Días que se ganan al cumplir `yearsCompleted` años de servicio. */
export function lftVacationDays(yearsCompleted: number): number {
  if (yearsCompleted < 1) return 0; // aún no cumple el primer año: no hay derecho
  if (yearsCompleted <= 5) return 10 + 2 * yearsCompleted;
  // Del sexto en adelante: 22 días, +2 por cada bloque de 5 años.
  return 20 + 2 * Math.ceil((yearsCompleted - 5) / 5);
}

/** La misma fecha, `years` años después. El 29-feb cae al 28-feb en año común. */
export function addYears(date: Date, years: number): Date {
  const result = new Date(Date.UTC(
    date.getUTCFullYear() + years,
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  // Si el día se desbordó (29-feb → 1-mar), lo regresamos al último día del mes.
  if (result.getUTCMonth() !== date.getUTCMonth()) result.setUTCDate(0);
  return result;
}

/** Años de servicio COMPLETOS a una fecha dada. */
export function yearsOfService(hireDate: Date, at: Date): number {
  let years = at.getUTCFullYear() - hireDate.getUTCFullYear();
  if (addYears(hireDate, years).getTime() > at.getTime()) years -= 1;
  return Math.max(0, years);
}

/** Fecha del próximo aniversario a partir de `at`. */
export function nextAnniversary(hireDate: Date, at: Date): Date {
  return addYears(hireDate, yearsOfService(hireDate, at) + 1);
}

/**
 * Días de vacaciones ganados en los aniversarios que cayeron DESPUÉS de `after`
 * y hasta `until` (ambos inclusive en `until`).
 *
 * `after` es la fecha de corte del saldo capturado a mano: lo anterior a ella ya
 * está contemplado en ese número y volver a sumarlo sería contarlo dos veces.
 */
export function vacationEarnedBetween(hireDate: Date, after: Date, until: Date): number {
  if (until.getTime() <= after.getTime()) return 0;

  const firstYear = yearsOfService(hireDate, after) + 1;
  const lastYear = yearsOfService(hireDate, until);

  let earned = 0;
  for (let year = firstYear; year <= lastYear; year += 1) {
    earned += lftVacationDays(year);
  }
  return earned;
}

/** Lo que Horarios dice de un día concreto de una persona. */
export type DiaDeHorario = { userId: string; date: Date; status: string };

/**
 * Quita los días que Asistencia llama vacaciones pero Horarios contradice.
 *
 * ⚠️ **HORARIOS MANDA.** Un DESCANSO que cae dentro de un periodo de vacaciones
 * NO gasta un día de vacaciones: la persona iba a descansar ese día de todas
 * formas. Asistencia, en cambio, marca `VACATION` el tramo entero —incluidos
 * los descansos de en medio— y sumar las dos tablas contaba esos días como
 * consumidos.
 *
 * Pasó de verdad con Waira en julio de 2026: tomó **12** días de vacaciones y
 * el saldo le restó **16**, dejándola en 0 cuando le quedaban 4. Los cuatro de
 * más eran el domingo 19, el lunes 20, el miércoles 29 y el jueves 30, los
 * cuatro marcados DESCANSO en Horarios.
 *
 * Que Horarios sea la fuente de verdad de qué es cada día no es una decisión
 * nueva: es la misma por la que las pantallas dejaron de adivinar quién trabaja
 * a partir de la meta del RDV.
 *
 * Un día SIN fila en Horarios se conserva: ahí Asistencia es lo único que hay,
 * y descartarlo perdería vacaciones que sí se tomaron.
 */
export function soloLasQueHorariosConfirma(
  candidatos: VacationDayRow[],
  horarios: DiaDeHorario[]
): VacationDayRow[] {
  const clave = (userId: string, date: Date) => `${userId}|${date.toISOString().slice(0, 10)}`;

  const dice = new Map<string, string>();
  for (const dia of horarios) dice.set(clave(dia.userId, dia.date), dia.status);

  return candidatos.filter((fila) => {
    const loQueDice = dice.get(clave(fila.userId, fila.date));
    return loQueDice === undefined || loQueDice === "VACATION";
  });
}
