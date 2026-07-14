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
