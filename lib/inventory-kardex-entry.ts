/**
 * Kardex de inventario: validación de un movimiento y cálculo de la existencia
 * teórica.
 *
 * Vive aparte de `lib/inventory-kardex` porque ese módulo importa Prisma, y
 * `lib/prisma` lanza en el entorno de pruebas. Es el mismo reparto que siguen
 * las otras cuatro capturas.
 *
 * ## El modelo
 *
 * La existencia NO se guarda: se calcula. Guardar un número al que se le suma y
 * resta es como se corrompe un inventario —un error queda incrustado y ya no hay
 * forma de saber cuál fue—. Aquí siempre se recalcula desde el principio:
 *
 * ```
 * teórico = inventario inicial
 *         + recepciones + traspasos de entrada + devoluciones de cliente
 *         − ventas − traspasos de salida
 *         ± ajustes
 * ```
 *
 * ## Dos cosas que no son obvias
 *
 * 1. **La venta no es un movimiento capturado.** Sale de las piezas que ya se
 *    registran en `Kpi` día a día. Pedirla otra vez sería doble captura, y
 *    guardarla dos veces dejaría el teórico bajo. La contrapartida: si un día no
 *    se capturan KPIs, el kardex cree que esa mercancía sigue en piso. La alarma
 *    de `lib/capture-freshness` es lo que evita que eso pase inadvertido.
 *
 * 2. **La devolución de cliente sí va aquí.** Las piezas de `Kpi` son BRUTAS
 *    —el POS las desglosa por asesor— y las devoluciones se consultan aparte, a
 *    nivel tienda. Al llegar por caminos distintos no hay doble conteo.
 */

export type InventoryMovementType =
  | "RECEPCION"
  | "TRANSFERENCIA_ENTRADA"
  | "DEVOLUCION_CLIENTE"
  | "TRANSFERENCIA_SALIDA"
  | "AJUSTE_POSITIVO"
  | "AJUSTE_NEGATIVO";

/** Los seis tipos, en el orden en que se muestran al capturar. */
export const MOVEMENT_TYPES: InventoryMovementType[] = [
  "RECEPCION",
  "TRANSFERENCIA_ENTRADA",
  "DEVOLUCION_CLIENTE",
  "TRANSFERENCIA_SALIDA",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO"
];

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  RECEPCION: "Recepción de mercancía",
  TRANSFERENCIA_ENTRADA: "Traspaso de entrada",
  DEVOLUCION_CLIENTE: "Devolución de cliente",
  TRANSFERENCIA_SALIDA: "Traspaso de salida",
  AJUSTE_POSITIVO: "Ajuste a favor",
  AJUSTE_NEGATIVO: "Ajuste en contra"
};

/**
 * Techo defensivo de piezas por movimiento. Un traspaso real no se acerca; un
 * dedazo (teclear el folio en la casilla de la cantidad) sí lo rebasa, y sin
 * este límite envenenaría el teórico de forma silenciosa y difícil de rastrear.
 */
const MAX_QUANTITY = 100_000;

/** Techo del inventario inicial. Una tienda no tiene millones de piezas. */
const MAX_BASELINE = 1_000_000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function movementLabel(type: InventoryMovementType): string {
  return MOVEMENT_LABELS[type];
}

export function isMovementType(value: unknown): value is InventoryMovementType {
  return typeof value === "string" && (MOVEMENT_TYPES as string[]).includes(value);
}

/**
 * Piezas con el signo que le corresponde al tipo.
 *
 * `quantity` se guarda SIEMPRE positivo y el sentido lo pone el tipo. Permitir
 * cantidades negativas dejaría que un traspaso de salida capturado en negativo
 * sumara mercancía en vez de restarla, sin que nada lo delate.
 */
export function signedQuantity(type: InventoryMovementType, quantity: number): number {
  switch (type) {
    case "RECEPCION":
    case "TRANSFERENCIA_ENTRADA":
    case "DEVOLUCION_CLIENTE":
    case "AJUSTE_POSITIVO":
      return quantity;
    case "TRANSFERENCIA_SALIDA":
    case "AJUSTE_NEGATIVO":
      return -quantity;
  }
}

export type MovementEntry = {
  date: string;
  type: string;
  quantity: number | string;
  reference?: string | null;
  counterpart?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

export type NormalizedMovement = {
  date: Date;
  type: InventoryMovementType;
  quantity: number;
  reference: string | null;
  counterpart: string | null;
  note: string | null;
  createdBy: string | null;
};

export type NormalizeMovementOutcome =
  | { ok: true; value: NormalizedMovement }
  | { ok: false; error: string };

/**
 * Valida un movimiento capturado a mano.
 *
 * `baselineDate` no es opcional por comodidad: un movimiento anterior al
 * inventario inicial contaría mercancía que ya se contó físicamente, y el
 * teórico saldría inflado sin ninguna señal de error. Es el fallo más caro que
 * puede tener un kardex, así que se rechaza en la puerta.
 */
export function normalizeMovementEntry(
  entry: MovementEntry,
  { baselineDate, today }: { baselineDate: Date; today: Date }
): NormalizeMovementOutcome {
  if (!DATE_PATTERN.test(entry.date ?? "")) {
    return { ok: false, error: `Fecha inválida (${String(entry.date)}), se espera AAAA-MM-DD.` };
  }
  const date = new Date(`${entry.date}T00:00:00.000Z`);
  // El ida y vuelta descarta días que no existen (2026-02-31 no da NaN: rueda a marzo).
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) {
    return { ok: false, error: `Fecha inexistente (${entry.date}).` };
  }
  if (date.getTime() > today.getTime()) {
    return { ok: false, error: `${entry.date}: no se puede registrar un movimiento en el futuro.` };
  }
  // El corte es el DÍA del inventario, no el instante: todo lo que pasó hasta el
  // cierre de ese día ya está reflejado en las piezas contadas. Por eso el kardex
  // arranca al día siguiente, y por eso las ventas se suman con el mismo criterio
  // (`date > baseline`) — si aquí se aceptara el día del conteo y allá no, un
  // traspaso del martes sumaría dos veces.
  if (date.getTime() <= baselineDate.getTime()) {
    return {
      ok: false,
      error: `${entry.date}: no es posterior al inventario inicial (${baselineDate.toISOString().slice(0, 10)}). Lo de ese día ya está contado en la base.`
    };
  }

  if (!isMovementType(entry.type)) {
    return { ok: false, error: `${entry.date}: tipo de movimiento desconocido (${String(entry.type)}).` };
  }
  const type = entry.type;

  const quantity = toNumber(entry.quantity);
  if (quantity === null) {
    return { ok: false, error: `${entry.date} (${movementLabel(type)}): la cantidad no es un número.` };
  }
  if (!Number.isInteger(quantity)) {
    return { ok: false, error: `${entry.date} (${movementLabel(type)}): la cantidad debe ser piezas enteras (${quantity}).` };
  }
  if (quantity <= 0) {
    return {
      ok: false,
      error: `${entry.date} (${movementLabel(type)}): la cantidad debe ser mayor que cero. El sentido lo da el tipo de movimiento, no el signo.`
    };
  }
  if (quantity > MAX_QUANTITY) {
    return { ok: false, error: `${entry.date} (${movementLabel(type)}): ${quantity} piezas parece un error de captura.` };
  }

  // Un ajuste sin motivo es una diferencia que desaparece sin dejar rastro, que
  // es justo lo que este kardex existe para evitar.
  const note = cleanText(entry.note, 500);
  if ((type === "AJUSTE_POSITIVO" || type === "AJUSTE_NEGATIVO") && !note) {
    return { ok: false, error: `${entry.date}: un ajuste necesita motivo. Sin él la diferencia se pierde sin explicación.` };
  }

  return {
    ok: true,
    value: {
      date,
      type,
      quantity,
      reference: cleanText(entry.reference, 64),
      counterpart: cleanText(entry.counterpart, 120),
      note,
      createdBy: cleanText(entry.createdBy, 32)
    }
  };
}

export type BaselineEntry = {
  date: string;
  pieces: number | string;
  countId?: string | null;
  note?: string | null;
};

export type NormalizedBaseline = { date: Date; pieces: number; countId: string | null; note: string | null };

export type NormalizeBaselineOutcome =
  | { ok: true; value: NormalizedBaseline }
  | { ok: false; error: string };

export function normalizeBaselineEntry(
  entry: BaselineEntry,
  { today }: { today: Date }
): NormalizeBaselineOutcome {
  if (!DATE_PATTERN.test(entry.date ?? "")) {
    return { ok: false, error: `Fecha inválida (${String(entry.date)}), se espera AAAA-MM-DD.` };
  }
  const date = new Date(`${entry.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) {
    return { ok: false, error: `Fecha inexistente (${entry.date}).` };
  }
  if (date.getTime() > today.getTime()) {
    return { ok: false, error: `${entry.date}: el inventario inicial no puede ser una fecha futura.` };
  }

  const pieces = toNumber(entry.pieces);
  if (pieces === null) return { ok: false, error: "Las piezas del inventario inicial no son un número." };
  if (!Number.isInteger(pieces)) return { ok: false, error: `El inventario inicial debe ser piezas enteras (${pieces}).` };
  if (pieces < 0) return { ok: false, error: "El inventario inicial no puede ser negativo." };
  if (pieces > MAX_BASELINE) return { ok: false, error: `${pieces} piezas parece un error de captura.` };

  return {
    ok: true,
    value: { date, pieces, countId: cleanText(entry.countId, 64), note: cleanText(entry.note, 500) }
  };
}

export type KardexMovement = { type: InventoryMovementType; quantity: number };

export type KardexSummary = {
  baselinePieces: number;
  received: number;
  transferredIn: number;
  customerReturns: number;
  transferredOut: number;
  /** Piezas vendidas del periodo. Vienen de `Kpi`, no de los movimientos. */
  sold: number;
  /** Neto de los ajustes, con signo. */
  adjustments: number;
  /** Existencia teórica de hoy. */
  theoretical: number;
};

/**
 * Existencia teórica y su desglose.
 *
 * Se recalcula entero cada vez, desde el inventario inicial. Es barato —son
 * sumas sobre unos cientos de filas— y a cambio el número nunca puede quedar
 * desincronizado de los movimientos que lo justifican.
 */
export function summarizeKardex({
  baselinePieces,
  movements,
  soldPieces
}: {
  baselinePieces: number;
  movements: KardexMovement[];
  soldPieces: number;
}): KardexSummary {
  const summary: KardexSummary = {
    baselinePieces,
    received: 0,
    transferredIn: 0,
    customerReturns: 0,
    transferredOut: 0,
    sold: soldPieces,
    adjustments: 0,
    theoretical: 0
  };

  for (const movement of movements) {
    switch (movement.type) {
      case "RECEPCION":
        summary.received += movement.quantity;
        break;
      case "TRANSFERENCIA_ENTRADA":
        summary.transferredIn += movement.quantity;
        break;
      case "DEVOLUCION_CLIENTE":
        summary.customerReturns += movement.quantity;
        break;
      case "TRANSFERENCIA_SALIDA":
        summary.transferredOut += movement.quantity;
        break;
      case "AJUSTE_POSITIVO":
      case "AJUSTE_NEGATIVO":
        summary.adjustments += signedQuantity(movement.type, movement.quantity);
        break;
    }
  }

  summary.theoretical =
    baselinePieces +
    summary.received +
    summary.transferredIn +
    summary.customerReturns +
    summary.adjustments -
    summary.transferredOut -
    summary.sold;

  return summary;
}

/**
 * Diferencia de un conteo físico contra el teórico.
 *
 * Negativa = falta mercancía. Es **acumulada desde el inventario inicial**, no
 * del periodo entre conteos: la base no se reancla nunca. Ver el comentario de
 * `InventoryBaseline` en el esquema.
 */
export function countDifference(counted: number, theoretical: number): number {
  return counted - theoretical;
}

function cleanText(raw: unknown, maxLength: number): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim().replace(/\s+/g, " ");
  if (!value) return null;
  return value.slice(0, maxLength);
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).trim().replace(/[\s,]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
