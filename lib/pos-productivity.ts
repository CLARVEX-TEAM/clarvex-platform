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
  /**
   * Solo la MAGNITUD; la dirección la decide `discountAsReduction`.
   *
   * El reporte casi siempre lo muestra en negativo, y el prompt pide copiarlo
   * en positivo, pero ninguna de las dos cosas es de fiar por sí sola.
   */
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
  /**
   * Bruto y descuento CON IVA, como los da el reporte.
   *
   * **Nulos cuando el descuento del día es una reversión** (ver
   * `discountAsReduction`): ahí el descuento no es de este día, sino de la
   * venta que se devolvió, y dividirlo por el bruto de hoy no da un margen.
   * Van los dos o no va ninguno — con uno solo no hay margen que calcular.
   */
  grossSales: number | null;
  discountAmount: number | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const close = (left: number, right: number, tolerance = CENT) => Math.abs(left - right) <= tolerance;

/**
 * La rebaja del día, **con signo**.
 *
 * ⚠️ La columna «Ventas Descuento» casi siempre es una rebaja y el reporte la
 * muestra en negativo. Pero un día de pura devolución la muestra al REVÉS: al
 * devolverse una prenda rebajada, su descuento se revierte y entonces SUMA.
 * Pasó el 27 de agosto de 2026 —una asesora con un solo ticket, de devolución—
 * y tumbó la captura del día entero, incluidas las dos filas que sí cuadraban.
 *
 * El signo NO se toma de lo que devuelve el lector. El prompt le pide magnitud,
 * así que copiarlo tal cual dejaría cada día normal a merced de que el modelo
 * respete una instrucción. Se deduce de la cuenta del propio reporte: el bruto
 * menos la rebaja tiene que dar el importe posterior al descuento.
 *
 * La MAGNITUD sigue verificada igual que antes —es la que se lee mal cuando se
 * lee mal un dígito—; lo único que se deduce aquí es la dirección. Y no hay
 * empate posible: las dos opciones solo coinciden cuando la rebaja es cero.
 */
export function discountAsReduction(row: PosRow): number | null {
  const magnitude = Math.abs(row.discount);
  if (close(row.gross - magnitude, row.afterDiscount)) return magnitude;
  if (close(row.gross + magnitude, row.afterDiscount)) return -magnitude;
  return null;
}

/**
 * Las cuatro cuentas internas del reporte. Es la red que sostiene todo: sin
 * ellas, leer una captura de pantalla sería confiar y ya.
 */
export function rowProblems(row: PosRow): string[] {
  const problems: string[] = [];
  const who = row.name || "(sin nombre)";

  if (discountAsReduction(row) === null) {
    problems.push(`${who}: bruto ${row.gross} y descuento ${row.discount} no dan ${row.afterDiscount}.`);
  }
  if (!close(row.afterDiscount - row.returns, row.net)) {
    problems.push(`${who}: al restar devoluciones ${row.returns} no da el neto ${row.net}.`);
  }
  if (row.tickets > 0) {
    /*
     * ⚠️ El promedio de unidades del reporte va sobre las unidades NETAS, no
     * sobre las vendidas.
     *
     * Con devoluciones de por medio: 9 vendidas, 4 devueltas y 3 tickets dan
     * 1.67, no 3.00. Comprobarlo contra las brutas detenía capturas buenas
     * justo los días en que hubo una devolución — que son los días en que más
     * cuidado hay que tener con los números.
     *
     * Dos decimales de tolerancia: el reporte redondea los promedios.
     */
    const netUnits = row.units - row.unitsReturned;
    if (!close(netUnits / row.tickets, row.avgUnits, 0.011)) {
      problems.push(
        row.unitsReturned > 0
          ? `${who}: ${row.units} unidades menos ${row.unitsReturned} devueltas, entre ${row.tickets} tickets, no da ${row.avgUnits}.`
          : `${who}: ${row.units} unidades entre ${row.tickets} tickets no da ${row.avgUnits}.`
      );
    }
    if (!close(row.net / row.tickets, row.avgAmount, 0.011)) {
      problems.push(`${who}: el neto entre ${row.tickets} tickets no da ${row.avgAmount}.`);
    }
  } else {
    /*
     * ⚠️ **Con 0 tickets, las DOS comprobaciones de arriba no se ejecutan.**
     *
     * Y son las únicas que miran `units`: dividir entre los tickets es lo que
     * ata las unidades a un número impreso aparte. Sin ellas, `units` entra sin
     * que nadie la haya mirado —una fila con 0 tickets y 37 unidades pasaba
     * entera— y esas 37 bajan al kardex como piezas vendidas.
     *
     * No se puede vender una unidad sin una transacción, así que con cero
     * tickets las unidades tienen que ser cero. No se comprueban aquí las
     * DEVUELTAS: no está confirmado que una devolución genere ticket en este
     * POS, y `unitsReturned` no baja al kardex —solo participa en la cuenta del
     * promedio—, así que exigirlo arriesgaría bloquear un día legítimo a cambio
     * de nada.
     */
    if (row.net !== 0) problems.push(`${who}: hay venta con 0 tickets.`);
    if (row.units !== 0) problems.push(`${who}: hay ${row.units} unidades con 0 tickets.`);
  }
  /*
   * El descuento NO entra aquí: su signo es informativo y lo resuelve
   * `discountAsReduction`. Los de abajo sí son imposibles — una devolución vive
   * en su propia columna, no en el bruto.
   */
  if (row.tickets < 0 || row.units < 0 || row.gross < 0) {
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
    value: report.rows.map((row) => {
      // `rowProblems` ya paso, asi que aqui nunca es null.
      const reduction = discountAsReduction(row) ?? 0;
      const reversion = reduction < 0;
      return {
        name: row.name,
        dailySales: round2(row.net / VAT),
        transactions: row.tickets,
        pieces: row.units,
        grossSales: reversion ? null : row.gross,
        discountAmount: reversion ? null : reduction
      };
    })
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
 * ¿Difieren en UNA sola letra? (una de más, una de menos, o una cambiada)
 *
 * Se escribe a mano en vez de una distancia de edición completa porque solo
 * interesa el caso de una errata: con un recorrido lineal basta y no hay que
 * elegir un umbral.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;

  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let fallos = 0;

  while (i < corto.length && j < largo.length) {
    if (corto[i] === largo[j]) {
      i += 1;
      j += 1;
      continue;
    }
    fallos += 1;
    if (fallos > 1) return false;
    // Si son igual de largos, la letra esta cambiada; si no, sobra en el largo.
    if (corto.length === largo.length) i += 1;
    j += 1;
  }
  return fallos + (largo.length - j) + (corto.length - i) <= 1;
}

/**
 * ¿Estos dos apellidos son el mismo?
 *
 * No se puede comparar por igualdad. El visor del POS **corta** los nombres
 * («POPOCA, WAIRA ZITLAL») y además estropea la Ñ («TREVIÃO» por TREVIÑO), así
 * que se compara por prefijo: cinco letras, o el apellido entero si es más
 * corto. Menos de tres letras nunca empareja — con dos, media tienda encaja.
 *
 * ⚠️ El prefijo NO basta cuando el lector mete una letra a mitad de palabra.
 * Paso el 26 de agosto de 2026: leyó «POPCOCA» por POPOCA y el prefijo comun
 * se quedo en 3 letras, asi que Waira no se emparejo y su venta del dia no se
 * cargo. Por eso se acepta ademas una sola errata.
 *
 * Se exige que el apellido tenga al menos cinco letras para esa tolerancia: en
 * uno corto, una letra de diferencia puede ser otra persona. Y aunque se cuele
 * un parecido, `matchPosRows` rechaza lo ambiguo antes de asignar nada.
 */
export function sameSurname(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  const required = Math.min(5, a.length, b.length);
  if (required < 3) return false;
  if (commonPrefix(a, b) >= required) return true;
  return Math.min(a.length, b.length) >= 5 && withinOneEdit(a, b);
}

export type PosPerson = { id: string; name: string; employeeNumber: string };

export type PosMatch = {
  matched: Array<{ row: PosCapture; user: PosPerson }>;
  unmatched: string[];
  ambiguous: Array<{ name: string; candidates: string[] }>;
};

/**
 * Empareja comparando CUALQUIER parte del nombre contra cualquier parte de la
 * suya: basta con que coincida una.
 *
 * Antes solo se miraba el apellido, y eso deja fuera el caso mas comun de
 * error: que el lector estropee el apellido pero acierte el nombre de pila.
 * Con «POPCOCA, WAIRA ZITTAL», el apellido venia mal y «WAIRA» estaba ahi al
 * lado, intacto.
 *
 * ⚠️ La red de seguridad es la que hace esto seguro: si alguna parte del
 * nombre encaja con DOS personas, no se elige ninguna y se reporta ambiguo.
 * Colgarle la venta del día a quien no es le mueve el alcance y la comisión a
 * dos personas a la vez, y nadie lo nota hasta el recibo.
 */
export function matchPosRows(rows: PosCapture[], people: PosPerson[]): PosMatch {
  const matched: PosMatch["matched"] = [];
  const unmatched: string[] = [];
  const ambiguous: PosMatch["ambiguous"] = [];

  for (const row of rows) {
    // «CASTRO, JAZMIN» → todas sus partes, la coma es solo separador.
    const partes = normalize(row.name)
      .split(/[\s,]+/)
      .map((parte) => parte.trim())
      .filter(Boolean);

    const candidates = people.filter((person) =>
      normalize(person.name)
        .split(/\s+/)
        .some((token) => partes.some((parte) => sameSurname(token, parte)))
    );

    if (candidates.length === 1) matched.push({ row, user: candidates[0] });
    else if (candidates.length === 0) unmatched.push(row.name);
    else ambiguous.push({ name: row.name, candidates: candidates.map((person) => person.name) });
  }

  return { matched, unmatched, ambiguous };
}
