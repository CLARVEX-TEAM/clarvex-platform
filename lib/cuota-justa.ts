/**
 * Lectura de la «Cuota Justa» pegada desde Excel.
 *
 * La tienda reparte la meta semanal entre su gente en un archivo propio
 * (`Formatos PROPUESTA FINAL`, hoja **CJ**) y hoy esos importes se teclean uno
 * por uno en la captura. Esto los toma de un pegado y los convierte en la meta
 * diaria de cada persona.
 *
 * ## Cómo es la tabla
 *
 * Cada día ocupa **dos columnas**: el porcentaje y el importe. La fila `FECHA`
 * solo trae la fecha en la primera de las dos —son celdas combinadas y al copiar
 * la segunda llega vacía—, así que el importe de un día está siempre en la
 * columna **siguiente** a la de su fecha.
 *
 * ```
 * FECHA   16-ago-26          17-ago-26
 * DIA     DOMINGO            LUNES
 * META    $32,695.59         $10,898.53
 * Itzel   10%   $3,269.56    10%   $1,089.85
 * ```
 *
 * ## Qué se ignora a propósito
 *
 * El bloque **WHATSAPP** que va debajo. Son ~$102 al día para toda la tienda y
 * mezclarlo con la venta de piso distorsionaría el alcance. Decisión de Adrian.
 *
 * Módulo sin Prisma: es donde vive el riesgo y tiene que poder probarse solo.
 */

const MAX_GOAL = 10_000_000;

export type PersonGoals = {
  /** Nombre tal como aparece en la Cuota Justa (suele ser solo el de pila). */
  name: string;
  /** Meta por día, en pesos. Clave `AAAA-MM-DD`. */
  goals: Record<string, number>;
};

export type CuotaJusta = {
  /** Días de la semana, en orden. */
  dates: string[];
  people: PersonGoals[];
  /** Meta de TIENDA por día, de la fila `META`. Sirve para cuadrar. */
  storeGoals: Record<string, number>;
  /** Avisos que no impiden usar el resultado, pero conviene leer. */
  warnings: string[];
};

export type ParseOutcome = { ok: true; value: CuotaJusta } | { ok: false; error: string };

/** Diferencia máxima tolerada al cuadrar el reparto contra la meta de tienda. */
const ROUNDING_SLACK = 1;

export function parseCuotaJusta(raw: string): ParseOutcome {
  const rows = splitRows(raw);
  if (rows.length === 0) return { ok: false, error: "No se pegó nada." };

  const dateRowIndex = rows.findIndex((row) => firstLabel(row) === "FECHA");
  if (dateRowIndex === -1) {
    return {
      ok: false,
      error: "No se encontró la fila «FECHA». Copia el bloque de la Cuota Justa incluyendo esa fila y las de cada persona."
    };
  }

  // Columna de cada día → el importe vive en la SIGUIENTE (ver cabecera).
  const dayColumns: { column: number; date: string }[] = [];
  rows[dateRowIndex].forEach((cell, column) => {
    const date = parseDate(cell);
    if (date) dayColumns.push({ column, date });
  });
  if (dayColumns.length === 0) {
    return { ok: false, error: "La fila «FECHA» no trae ninguna fecha reconocible (se esperan días como 16-ago-26 o 2026-08-16)." };
  }

  const dates = dayColumns.map((day) => day.date);
  const duplicated = dates.find((date, index) => dates.indexOf(date) !== index);
  if (duplicated) return { ok: false, error: `La fecha ${duplicated} aparece dos veces. Revisa el bloque copiado.` };

  const storeGoals: Record<string, number> = {};
  const metaRow = rows.find((row) => firstLabel(row) === "META");
  if (metaRow) {
    for (const day of dayColumns) {
      // La fila META está combinada sobre las dos columnas del día, así que al
      // copiar su importe cae en la MISMA columna de la fecha —al revés que en
      // las filas de personas, donde la primera columna es el porcentaje—.
      const amount = parseAmount(metaRow[day.column + 1]) ?? parseAmount(metaRow[day.column]);
      if (amount !== null) storeGoals[day.date] = amount;
    }
  }

  // El reparto por persona va entre «PUNTO DE VENTA» y su «TOTAL». Lo que viene
  // después (PPTO, WHATSAPP) se descarta.
  const startIndex = rows.findIndex((row, index) => index > dateRowIndex && row.some((cell) => norm(cell) === "PUNTO DE VENTA"));
  const from = startIndex === -1 ? dateRowIndex + 1 : startIndex + 1;

  const people: PersonGoals[] = [];
  const warnings: string[] = [];
  for (let index = from; index < rows.length; index++) {
    const row = rows[index];
    const label = firstLabel(row);
    if (label === "TOTAL") break;
    // Sin nombre es una de las filas vacías que el formato deja de reserva.
    if (!label || label === "PUNTO DE VENTA") continue;
    if (label === "PPTO" || label === "WHATSAPP") break;

    const goals: Record<string, number> = {};
    for (const day of dayColumns) {
      const amount = parseAmount(row[day.column + 1]);
      if (amount === null) continue;
      if (amount < 0) return { ok: false, error: `${label}: la meta del ${day.date} es negativa.` };
      if (amount > MAX_GOAL) return { ok: false, error: `${label}: la meta del ${day.date} (${amount}) parece un error.` };
      goals[day.date] = amount;
    }
    // Una persona con todo en cero está en el formato pero no trabaja esa
    // semana: se deja fuera en vez de sembrarle metas de cero, que se leerían
    // como «no vendió» en vez de «no le tocaba».
    if (Object.values(goals).every((value) => value === 0)) {
      warnings.push(`${label} no tiene meta en ninguno de los días; se omite.`);
      continue;
    }
    people.push({ name: label, goals });
  }

  if (people.length === 0) {
    return { ok: false, error: "No se reconoció a ninguna persona con meta. ¿Se copió el bloque de PUNTO DE VENTA?" };
  }

  const repeated = people.map((person) => norm(person.name)).find((name, index, all) => all.indexOf(name) !== index);
  if (repeated) return { ok: false, error: `«${repeated}» aparece dos veces en el reparto. Revisa la tabla.` };

  // Cuadre contra la fila META: si el reparto no suma la meta del día, el pegado
  // se quedó corto de columnas o de filas, y sembrar eso dejaría metas mal
  // repartidas sin que nada avisara.
  for (const [date, storeGoal] of Object.entries(storeGoals)) {
    const shared = people.reduce((sum, person) => sum + (person.goals[date] ?? 0), 0);
    if (Math.abs(shared - storeGoal) > ROUNDING_SLACK) {
      warnings.push(
        `El ${date} el reparto suma ${round(shared)} pero la meta de tienda es ${round(storeGoal)}. Puede faltar alguien en la selección.`
      );
    }
  }

  return { ok: true, value: { dates, people, storeGoals, warnings } };
}

/** Total de la semana por persona, para enseñarlo antes de guardar. */
export function weeklyTotal(person: PersonGoals): number {
  return round(Object.values(person.goals).reduce((sum, value) => sum + value, 0));
}

function splitRows(raw: string): string[][] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/**
 * Primer texto de la fila que sea de verdad una etiqueta: ni vacío, ni importe,
 * ni porcentaje. Las filas de reserva del formato empiezan por `0%`, y tomarlo
 * por un nombre metía una persona fantasma llamada «0%».
 */
function firstLabel(row: string[]): string {
  for (const cell of row) {
    const value = cell.trim();
    if (!value) continue;
    if (parseAmount(value) !== null) return "";
    if (/^-?[\d.,\s]+%$/.test(value)) return "";
    return norm(value);
  }
  return "";
}

function norm(value: string): string {
  return Array.from(value.normalize("NFD"))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("")
    .trim()
    .toUpperCase();
}

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7,
  AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12
};

/**
 * Fechas como las escupe Excel al copiar: `16-ago-26`, `16/08/2026`,
 * `2026-08-16`. Devuelve `AAAA-MM-DD` o `null`.
 */
export function parseDate(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const textual = value.match(/^(\d{1,2})[-/\s]([A-Za-zÁÉÍÓÚáéíóú]{3,})[-/\s](\d{2,4})$/);
  if (textual) {
    const month = MONTHS[norm(textual[2]).slice(0, 3)];
    if (!month) return null;
    return validDate(fullYear(Number(textual[3])), month, Number(textual[1]));
  }

  const numeric = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  // Día primero: el formato de la tienda es es-MX.
  if (numeric) return validDate(fullYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));

  return null;
}

function fullYear(value: number): number {
  return value < 100 ? 2000 + value : value;
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const iso = date.toISOString().slice(0, 10);
  // El ida y vuelta descarta días que no existen (31 de febrero rueda a marzo).
  return iso === `${year}-${pad(month)}-${pad(day)}` ? iso : null;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Importes como los pega Excel: `$3,269.56`, `3269.56`, `$ 1,089.85`.
 * Devuelve `null` si no es un número (un nombre, un `%`, una celda vacía).
 */
export function parseAmount(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  // Los porcentajes son la otra columna de cada día y nunca son el importe.
  if (value.includes("%")) return null;
  const cleaned = value.replace(/[$\s,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ─── Emparejar con la gente de Clarvex ──────────────────────────────────── */

export type Candidate = { id: string; name: string; employeeNumber: string };

export type MatchedPerson = {
  user: Candidate;
  /** Nombre tal como venía en la Cuota Justa. */
  source: string;
  goals: Record<string, number>;
};

export type MatchOutcome = {
  matched: MatchedPerson[];
  /** Nombres de la Cuota Justa que no corresponden a nadie de la tienda. */
  unmatched: string[];
  /** Nombres que encajan con VARIAS personas: no se elige por sorteo. */
  ambiguous: { name: string; candidates: string[] }[];
};

/**
 * Cruza los nombres de la Cuota Justa con la plantilla de la tienda.
 *
 * La hoja trae solo el nombre de pila («Waira», «Jazmín»), así que se compara
 * contra las palabras del nombre completo, sin acentos.
 *
 * ⚠️ **Nunca se elige entre varios.** Si «Ana» encaja con Ana Torres y Ana Ruiz,
 * la fila se marca como ambigua y no se escribe: sembrarle una semana de metas a
 * la persona equivocada es peor que no sembrar nada, porque su alcance y su
 * comisión salen mal sin que nadie lo note.
 */
export function matchCuotaJusta(people: PersonGoals[], candidates: Candidate[]): MatchOutcome {
  const outcome: MatchOutcome = { matched: [], unmatched: [], ambiguous: [] };
  const taken = new Set<string>();

  for (const person of people) {
    const target = norm(person.name);
    const hits = candidates.filter((candidate) => {
      const words = norm(candidate.name).split(/\s+/).filter(Boolean);
      return norm(candidate.name) === target || words.includes(target);
    });

    if (hits.length === 0) {
      outcome.unmatched.push(person.name);
      continue;
    }
    if (hits.length > 1) {
      outcome.ambiguous.push({ name: person.name, candidates: hits.map((hit) => `${hit.name} (${hit.employeeNumber})`) });
      continue;
    }
    // Dos filas distintas apuntando a la misma persona sería un error de la
    // hoja; la segunda pisaría a la primera en silencio.
    if (taken.has(hits[0].id)) {
      outcome.ambiguous.push({ name: person.name, candidates: [`${hits[0].name}: ya asignado por otra fila`] });
      continue;
    }
    taken.add(hits[0].id);
    outcome.matched.push({ user: hits[0], source: person.name, goals: person.goals });
  }

  return outcome;
}
