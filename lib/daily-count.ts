/**
 * Conteo diario de una sección del piso de venta.
 *
 * Nació del inventario de agosto de 2026: faltaba producto de dama y se pidió
 * contarla a diario. Es una cosa APARTE del conteo físico quincenal y APARTE
 * del kardex — contar no mueve existencias, igual que hoy.
 *
 * Dos ideas lo sostienen:
 *
 * 1. **El juego de marbetes se arma solo.** Nadie tiene la lista de qué
 *    marbetes son de dama; se sabe al escanearlos. El primer conteo enrola cada
 *    marbete que se escanea, y a partir del segundo día ya salen precargados.
 *
 * 2. **Un marbete que baja NO es una pérdida.** Puede haberse vendido, agotado
 *    o movido a otro marbete. Solo lo que queda sin explicación cuenta, y por
 *    eso el motivo es lista cerrada con referencia verificable.
 */

/** Sección que se cuenta a diario. Hoy solo hay una; el modelo aguanta más. */
export const SECTION_DAMA = "DAMA";

export const COUNT_KIND_PHYSICAL = "FISICO";
export const COUNT_KIND_DAILY = "DIARIO";

/**
 * Motivos por los que un marbete puede bajar.
 *
 * Es lista cerrada a propósito. Con texto libre, a las dos semanas todos los
 * faltantes dicen «se vendió» y el reporte deja de significar nada.
 */
export const DROP_REASONS = ["VENTA", "MOVIDO", "SALIDA", "SIN_EXPLICACION"] as const;

export type DropReason = (typeof DROP_REASONS)[number];

export function isDropReason(value: string): value is DropReason {
  return (DROP_REASONS as readonly string[]).includes(value);
}

export const REASON_LABEL: Record<DropReason, string> = {
  VENTA: "Se vendió / se agotó el estilo",
  MOVIDO: "Se movió a otro marbete",
  SALIDA: "Traspaso o SFS",
  SIN_EXPLICACION: "Sin explicación"
};

/** Qué pedir en la referencia según el motivo. Vacío = no pide nada. */
export const REASON_REF_LABEL: Record<DropReason, string> = {
  VENTA: "Estilo o SKU",
  MOVIDO: "Marbete destino",
  SALIDA: "Folio",
  SIN_EXPLICACION: ""
};

/**
 * Siguiente posición de export de una sección.
 *
 * ⚠️ Siempre el máximo + 1, NUNCA el primer hueco libre. Un marbete retirado
 * deja su posición vacía y ahí se queda: reciclarla haría que el «marbete 7» de
 * un reporte viejo apunte a un rack distinto que el de hoy.
 */
export function nextSectionPosition(taken: number[]): number {
  let max = 0;
  for (const position of taken) if (position > max) max = position;
  return max + 1;
}

export type SectionTag = {
  number: number;
  sectionPosition: number;
};

/** Fila de un conteo diario, ya cruzada contra el conteo anterior. */
export type DailyRow = {
  /** Número de marbete: interno, el de la etiqueta física. */
  number: number;
  /** Posición en el export: 1, 2, 3… Es lo que ve quien recibe el reporte. */
  position: number;
  label: string | null;
  /** Piezas del conteo anterior. `null` si ese día no se contó. */
  previous: number | null;
  /**
   * Piezas de hoy, ya resueltas con la regla de la mesa de control: vale el 1º,
   * salvo que el 2º difiera —entonces manda el 3º—. `null` mientras no se cuenta.
   */
  current: number | null;
  /** Los tres conteos tal cual se capturaron. */
  count1: number | null;
  count2: number | null;
  count3: number | null;
  /** El 2º no coincidió con el 1º y todavía falta el 3º que desempate. */
  needsRecount: boolean;
  reason: DropReason | null;
  reasonRef: string | null;
};

/**
 * Movimiento contra el conteo anterior.
 *
 * `null` cuando falta uno de los dos conteos: no contar y contar cero son cosas
 * distintas, y restarle a un hueco produce faltantes del tamaño del rack entero.
 */
export function rowMovement(row: DailyRow): number | null {
  if (row.previous === null || row.current === null) return null;
  return row.current - row.previous;
}

export type RowCheck =
  | { status: "NONE" }
  | { status: "OK"; detail: string }
  | { status: "PENDING"; detail: string }
  | { status: "REVIEW"; detail: string };

/**
 * Verifica la justificación de una fila que bajó.
 *
 * La única causa que no se puede inventar es la que se cruza con otro dato: si
 * se dice «se movió al marbete 15», el 15 tiene que haber subido esas piezas.
 * Sin esa comprobación, «se movió» sería la coartada perfecta.
 */
export function checkRow(row: DailyRow, rows: DailyRow[]): RowCheck {
  const movement = rowMovement(row);
  if (movement === null || movement >= 0) return { status: "NONE" };

  const missing = -movement;
  if (row.reason === null) {
    return { status: "PENDING", detail: `Faltan ${missing} piezas por justificar.` };
  }

  if (row.reason === "SIN_EXPLICACION") {
    return { status: "PENDING", detail: `${missing} piezas sin explicación.` };
  }

  if (row.reason === "MOVIDO") {
    const target = Number((row.reasonRef ?? "").trim());
    if (!Number.isInteger(target)) {
      return { status: "REVIEW", detail: "Falta indicar a qué marbete se movió." };
    }
    if (target === row.number) {
      return { status: "REVIEW", detail: "El marbete destino es el mismo de origen." };
    }
    const destination = rows.find((item) => item.number === target);
    if (!destination) {
      return { status: "REVIEW", detail: `El marbete ${target} no es de esta sección.` };
    }
    const gained = rowMovement(destination);
    if (gained === null) {
      return { status: "REVIEW", detail: `El marbete ${target} no se ha contado.` };
    }
    if (gained < missing) {
      return {
        status: "REVIEW",
        detail: `El marbete ${target} solo subió ${Math.max(gained, 0)} de ${missing} piezas.`
      };
    }
    return { status: "OK", detail: `Confirmado contra el marbete ${target}.` };
  }

  // VENTA y SALIDA: la referencia es para rastrear después, no se puede
  // comprobar desde aquí. Se exige que venga escrita.
  if ((row.reasonRef ?? "").trim() === "") {
    return { status: "REVIEW", detail: `Falta ${REASON_REF_LABEL[row.reason].toLowerCase()}.` };
  }
  return { status: "OK", detail: REASON_LABEL[row.reason] };
}

export type DailySummary = {
  /** Marbetes de la sección. */
  tags: number;
  /** Cuántos ya se contaron hoy. */
  counted: number;
  /** Piezas contadas hoy. */
  pieces: number;
  /** Suma de lo que bajó, en positivo. */
  drops: number;
  /** Suma de lo que subió. */
  gains: number;
  /** Bajas menos altas. Cero cuando la mercancía solo se movió de marbete. */
  net: number;
  /** Piezas sin justificar o justificadas como «sin explicación». */
  unexplained: number;
  /** Justificaciones que no se sostienen. */
  toReview: number;
};

/**
 * Resumen del día.
 *
 * `net` es el que evita el error de junta: si un marbete baja 2 y otro sube 2,
 * sumar solo las bajas reporta el doble de lo que de verdad falta.
 */
export function summarize(rows: DailyRow[]): DailySummary {
  const summary: DailySummary = {
    tags: rows.length,
    counted: 0,
    pieces: 0,
    drops: 0,
    gains: 0,
    net: 0,
    unexplained: 0,
    toReview: 0
  };

  for (const row of rows) {
    if (row.current !== null) {
      summary.counted += 1;
      summary.pieces += row.current;
    }
    const movement = rowMovement(row);
    if (movement !== null) {
      if (movement < 0) summary.drops += -movement;
      else summary.gains += movement;
    }
    const check = checkRow(row, rows);
    if (check.status === "PENDING") summary.unexplained += movement === null ? 0 : -movement;
    if (check.status === "REVIEW") summary.toReview += 1;
  }

  summary.net = summary.drops - summary.gains;
  return summary;
}

/**
 * Copia SOLO las piezas, una por línea, para pegarlas de un jalón en la columna
 * del Excel de OneDrive.
 *
 * ⚠️ Se recorre por POSICIÓN, de la 1 a la última, no por las filas contadas. Un
 * marbete sin contar tiene que dejar su renglón EN BLANCO: si se salta, todo lo
 * que va abajo se recorre un renglón y las piezas acaban pegadas en el marbete
 * equivocado — un descuadre silencioso y carísimo de encontrar.
 */
export function copyLines(rows: DailyRow[]): { text: string; positions: number; pending: number } {
  const byPosition = new Map(rows.map((row) => [row.position, row]));
  let last = 0;
  for (const row of rows) if (row.position > last) last = row.position;

  const lines: string[] = [];
  let pending = 0;
  for (let position = 1; position <= last; position += 1) {
    const row = byPosition.get(position);
    if (!row || row.current === null) {
      pending += 1;
      lines.push("");
    } else {
      lines.push(String(row.current));
    }
  }
  return { text: lines.join("\n"), positions: last, pending };
}


/**
 * Qué conteo toca capturar en un marbete.
 *
 * El 3º solo se ofrece cuando hace falta: si el 1º y el 2º coinciden, pedirlo
 * sería trabajo de más y además invitaría a "ajustar" un número que ya cuadró.
 */
export function nextSlot(row: {
  count1: number | null;
  count2: number | null;
  count3: number | null;
}): 1 | 2 | 3 | null {
  if (row.count1 === null) return 1;
  if (row.count2 === null) return 2;
  if (row.count3 === null && row.count1 !== row.count2) return 3;
  return null;
}
