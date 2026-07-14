/**
 * Días festivos oficiales de México (LFT Art. 74).
 *
 * Importan porque quien TRABAJA un festivo lo cobra distinto (LFT Art. 75), y
 * eso se reporta. En retail se trabaja casi siempre: el centro comercial abre.
 *
 * Los que se mueven ("primer lunes de febrero") se calculan, no se escriben a
 * mano: una lista fija se pudre al año siguiente y nadie se entera hasta que un
 * reporte sale mal.
 *
 * NO se incluye la fracción VII (1 de diciembre por transmisión del Poder
 * Ejecutivo, cada seis años). Desde 2024 la toma de posesión es el 1 de octubre,
 * así que esa fracción quedó desfasada de la realidad. Si algún año aplica, se
 * agrega a mano — es preferible eso a que la app invente un festivo que no es.
 */

/** Fecha del n-ésimo lunes de un mes. nth = 1 → el primero. */
function nthMonday(year: number, month: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  // 0 = domingo, 1 = lunes… Días hasta el primer lunes.
  const offset = (8 - first.getUTCDay()) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function key(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type Holiday = { date: string; label: string };

/** Festivos oficiales de un año, en orden. */
export function mexicanHolidays(year: number): Holiday[] {
  return [
    { date: key(new Date(Date.UTC(year, 0, 1))), label: "Año Nuevo" },
    { date: key(nthMonday(year, 1, 1)), label: "Día de la Constitución" },   // 1er lunes de febrero
    { date: key(nthMonday(year, 2, 3)), label: "Natalicio de Benito Juárez" }, // 3er lunes de marzo
    { date: key(new Date(Date.UTC(year, 4, 1))), label: "Día del Trabajo" },
    { date: key(new Date(Date.UTC(year, 8, 16))), label: "Independencia" },
    { date: key(nthMonday(year, 10, 3)), label: "Revolución Mexicana" },     // 3er lunes de noviembre
    { date: key(new Date(Date.UTC(year, 11, 25))), label: "Navidad" }
  ];
}

/** ¿Es festivo oficial? Recibe "YYYY-MM-DD". */
export function isHoliday(dateKey: string): boolean {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return mexicanHolidays(year).some((holiday) => holiday.date === dateKey);
}

/** Nombre del festivo, o null si no lo es. */
export function holidayLabel(dateKey: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return mexicanHolidays(year).find((holiday) => holiday.date === dateKey)?.label ?? null;
}
