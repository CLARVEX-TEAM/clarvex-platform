/**
 * Reporte «Productividad del vendedor sin no mercancía» del POS.
 *
 * Es la fuente diaria de venta, tickets y piezas por asesor, y de paso del
 * bruto y el descuento con los que sale el margen. Este módulo NO lee el
 * archivo: recibe las filas ya extraídas —del PDF o de una captura de
 * pantalla— y se encarga de lo que de verdad importa, que es **no dar por
 * buena una lectura equivocada**.
 *
 * El reporte trae cuatro cuentas que tienen que cuadrar en cada fila. Se
 * comprueban todas: si un dígito se leyó mal, alguna se rompe. Por eso una
 * captura de pantalla es aceptable aquí y no un acto de fe.
 *
 * ⚠️ **La venta del POS trae IVA y Clarvex la guarda SIN IVA.** Verificado
 * contra el 8 de agosto de 2026: 17,697.16 del reporte son los 15,256.17 que
 * quedaron capturados. El bruto y el descuento, en cambio, se guardan **con
 * IVA**, tal cual los da el reporte — también verificado contra la base.
 */

/** Divisor del IVA. Al margen no le afecta (es un cociente), a la venta sí. */
const VAT = 1.16;

/** Centavo de tolerancia: el reporte ya viene redondeado a dos decimales. */
const CENT = 0.011;

export type PosRow = {
  /** Tal como sale del reporte: «APELLIDO, NOMBRE», a veces cortado. */
  name: string;
  tickets: number;
  units: number;
  unitsReturned: number;
  gross: number;
  /** Positivo. En el reporte viene con signo menos. */
  discount: number;
  afterDiscount: number;
  returns: number;
  net: number;
  avgUnits: number;
  avgAmount: number;
};

export type PosReport = {
  /** Del encabezado: «Desde» y «Hasta». Tienen que ser el MISMO día. */
  from: string;
  to: string;
  storeNumber: string | null;
  rows: PosRow[];
};

export type PosOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/** Fila lista para capturar, ya convertida a lo que guarda Clarvex. */
export type PosCapture = {
  name: string;
  /** Venta SIN IVA. */
  dailySales: number;
  transactions: number;
  pieces: number;
  /** Bruto y descuento CON IVA, como los da el reporte. */
  grossSales: number;
  discountAmount: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const close = (left: number, right: number, tolerance = CENT) => Math.abs(left - right) <= tolerance;

/**
 * Las cuatro cuentas internas del reporte. Es la red que sostiene todo: sin
 * ellas, leer una captura de pantalla sería confiar y ya.
 */
export function rowProblems(row: PosRow): string[] {
  const problems: string[] = [];
  const who = row.name || "(sin nombre)";

  if (!close(row.gross - row.discount, row.afterDiscount)) {
    problems.push(`${who}: bruto ${row.gross} menos descuento ${row.discount} no da ${row.afterDiscount}.`);
  }
  if (!close(row.afterDiscount - row.returns, row.net)) {
    problems.push(`${who}: al restar devoluciones ${row.returns} no da el neto ${row.net}.`);
  }
  if (row.tickets > 0) {
    // Dos decimales de tolerancia: el reporte redondea los promedios.
    if (!close(row.units / row.tickets, row.avgUnits, 0.011)) {
      problems.push(`${who}: ${row.units} unidades entre ${row.tickets} tickets no da ${row.avgUnits}.`);
    }
    if (!close(row.net / row.tickets, row.avgAmount, 0.011)) {
      problems.push(`${who}: el neto entre ${row.tickets} tickets no da ${row.avgAmount}.`);
    }
  } else if (row.net !== 0) {
    problems.push(`${who}: hay venta con 0 tickets.`);
  }
  if (row.tickets < 0 || row.units < 0 || row.gross < 0 || row.discount < 0) {
    problems.push(`${who}: hay cantidades negativas.`);
  }
  return problems;
}

/**
 * Convierte el reporte en filas listas para capturar, o explica por qué no.
 *
 * No devuelve nada a medias: si una sola fila no cuadra, se detiene entera. Una
 * venta mal leída se arrastra al alcance y a la comisión, y para cuando alguien
 * lo note ya se pagó.
 */
export function posCaptureRows(report: PosReport): PosOutcome<PosCapture[]> {
  if (report.rows.length === 0) return { ok: false, error: "El reporte no trae ningún vendedor." };

  // Un reporte de varios días trae datos SUMADOS: capturarlos como si fueran de
  // un día metería la venta de toda la semana en una sola fecha.
  if (report.from !== report.to) {
    return {
      ok: false,
      error: `El reporte va del ${report.from} al ${report.to}. Saca el reporte de un solo día: los de varios días vienen sumados.`
    };
  }

  const problems = report.rows.flatMap((row) => rowProblems(row));
  if (problems.length > 0) {
    return { ok: false, error: `Las cuentas del reporte no cuadran, así que la lectura no es de fiar:\n${problems.join("\n")}` };
  }

  const repeated = report.rows
    .map((row) => normalize(row.name))
    .find((name, index, list) => list.indexOf(name) !== index);
  if (repeated) return { ok: false, error: `El vendedor «${repeated}» aparece dos veces en el reporte.` };

  return {
    ok: true,
    value: report.rows.map((row) => ({
      name: row.name,
      dailySales: round2(row.net / VAT),
      transactions: row.tickets,
      pieces: row.units,
      grossSales: row.gross,
      discountAmount: row.discount
    }))
  };
}

/* ─── Emparejar con la plantilla de la tienda ────────────────────────────── */

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ,]/g, "")
    .trim();
}

function commonPrefix(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

/**
 * ¿Estos dos apellidos son el mismo?
 *
 * No se puede comparar por igualdad. El visor del POS **corta** los nombres
 * («POPOCA, WAIRA ZITLAL») y además estropea la Ñ («TREVIÃO» por TREVIÑO), así
 * que se compara por prefijo: cinco letras, o el apellido entero si es más
 * corto. Menos de tres letras nunca empareja — con dos, media tienda encaja.
 */
export function sameSurname(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  const required = Math.min(5, a.length, b.length);
  if (required < 3) return false;
  return commonPrefix(a, b) >= required;
}

export type PosPerson = { id: string; name: string; employeeNumber: string };

export type PosMatch = {
  matched: Array<{ row: PosCapture; user: PosPerson }>;
  unmatched: string[];
  ambiguous: Array<{ name: string; candidates: string[] }>;
};

/**
 * Empareja por el APELLIDO, que es lo primero del reporte y lo único que nunca
 * viene cortado.
 *
 * ⚠️ Si un apellido encaja con dos personas, NO se elige: se reporta ambiguo.
 * Colgarle la venta del día a quien no es le mueve el alcance y la comisión a
 * dos personas a la vez, y nadie lo nota hasta el recibo.
 */
export function matchPosRows(rows: PosCapture[], people: PosPerson[]): PosMatch {
  const matched: PosMatch["matched"] = [];
  const unmatched: string[] = [];
  const ambiguous: PosMatch["ambiguous"] = [];

  for (const row of rows) {
    // «CASTRO, JAZMIN» → el apellido es lo que va antes de la coma.
    const surname = normalize(row.name).split(",")[0].trim();
    const candidates = people.filter((person) =>
      normalize(person.name)
        .split(/\s+/)
        .some((token) => sameSurname(token, surname))
    );

    if (candidates.length === 1) matched.push({ row, user: candidates[0] });
    else if (candidates.length === 0) unmatched.push(row.name);
    else ambiguous.push({ name: row.name, candidates: candidates.map((person) => person.name) });
  }

  return { matched, unmatched, ambiguous };
}
