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

import { counterpartLabel, findCounterpart } from "@/lib/inventory-counterparts";

export type InventoryMovementType =
  | "RECEPCION"
  | "TRANSFERENCIA_ENTRADA"
  | "DEVOLUCION_CLIENTE"
  | "TRANSFERENCIA_SALIDA"
  | "SFS"
  | "AJUSTE_POSITIVO"
  | "AJUSTE_NEGATIVO";

/** Los seis tipos, en el orden en que se muestran al capturar. */
export const MOVEMENT_TYPES: InventoryMovementType[] = [
  "RECEPCION",
  "TRANSFERENCIA_ENTRADA",
  "DEVOLUCION_CLIENTE",
  "TRANSFERENCIA_SALIDA",
  "SFS",
  "AJUSTE_POSITIVO",
  "AJUSTE_NEGATIVO"
];

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  RECEPCION: "Recepción de mercancía",
  TRANSFERENCIA_ENTRADA: "Traspaso de entrada",
  DEVOLUCION_CLIENTE: "Devolución de cliente",
  TRANSFERENCIA_SALIDA: "Traspaso de salida",
  SFS: "Ship From Store",
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
    case "SFS":
    case "AJUSTE_NEGATIVO":
      return -quantity;
  }
}

export type MovementEntry = {
  date: string;
  type: string;
  quantity: number | string;
  reference?: string | null;
  document?: string | null;
  delivery?: string | null;
  counterpart?: string | null;
  counterpartCode?: string | null;
  surplus?: number | string | null;
  missing?: number | string | null;
  note?: string | null;
  createdBy?: string | null;
};

export type NormalizedMovement = {
  date: Date;
  type: InventoryMovementType;
  quantity: number;
  reference: string | null;
  document: string | null;
  delivery: string | null;
  counterpart: string | null;
  counterpartCode: string | null;
  surplus: number | null;
  missing: number | null;
  note: string | null;
  createdBy: string | null;
};

/** Ventana de la ronda. `end` es `null` mientras sigue abierta. */
export type RoundWindow = { start: Date; end: Date | null };

export type NormalizeMovementOutcome =
  | { ok: true; value: NormalizedMovement }
  | { ok: false; error: string };

/**
 * Valida un movimiento capturado a mano.
 *
 * La ventana de la ronda no es opcional por comodidad: un movimiento anterior a
 * su inventario de apertura contaría mercancía que ya se contó físicamente, y el
 * teórico saldría inflado sin ninguna señal de error. Es el fallo más caro que
 * puede tener un kardex, así que se rechaza en la puerta.
 */
export function normalizeMovementEntry(
  entry: MovementEntry,
  { round, today }: { round: RoundWindow; today: Date }
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
  // ⚠️ El día del inventario SÍ entra en la ronda.
  //
  // El conteo lo hace RGIS antes de que la tienda abra, así que lo que pasa ese
  // día ocurre DESPUÉS de contar. Lo confirma el kardex real de la tienda: su
  // «Último Inventario» es el 18 de febrero y la primera fila de la hoja Ventas
  // es de ese mismo 18 de febrero.
  //
  // Las ventas se suman con el mismo criterio (`date >= start`). Si aquí se
  // aceptara el día del conteo y allá no —o al revés—, ese día se contaría dos
  // veces o se perdería entero.
  if (date.getTime() < round.start.getTime()) {
    return {
      ok: false,
      error: `${entry.date}: es anterior al inventario que abre la ronda (${round.start.toISOString().slice(0, 10)}). Esa mercancía ya está contada en la base.`
    };
  }
  // Una ronda cerrada ya se comparó contra su conteo físico. Dejar entrar un
  // movimiento después movería un teórico del que ya se sacaron conclusiones.
  if (round.end && date.getTime() > round.end.getTime()) {
    return {
      ok: false,
      error: `${entry.date}: la ronda cerró el ${round.end.toISOString().slice(0, 10)}. Ese movimiento va en la ronda siguiente.`
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

  // ⚠️ El ajuste es una SALIDA DE EMERGENCIA, no parte de la operación normal.
  //
  // Cuando RGIS cuenta y falta mercancía, quien da de baja las piezas es
  // CORPORATIVO, y esa baja entra como la base de la ronda SIGUIENTE, no como un
  // ajuste dentro de la que se cierra. Ejemplo real: corporativo manda un
  // teórico de 8000, RGIS encuentra 7990, corporativo da de baja las 10 y la
  // ronda nueva arranca en 7990.
  //
  // O sea: la diferencia se resuelve sola al reanclar. El ajuste solo haría
  // falta para corregir A MITAD de una ronda, que hoy no ocurre. Por eso exige
  // motivo: si alguna vez se usa, tiene que quedar claro quién y por qué.
  //
  // Además, el formato que se manda a corporativo no tiene dónde ponerlos: al
  // exportar, un ajuste hace que su teórico y el de Clarvex discrepen, y el
  // export lo avisa.
  const note = cleanText(entry.note, 500);
  if ((type === "AJUSTE_POSITIVO" || type === "AJUSTE_NEGATIVO") && !note) {
    return { ok: false, error: `${entry.date}: un ajuste necesita motivo. Sin él la diferencia se pierde sin explicación.` };
  }

  // Sobrantes y faltantes no entran al teórico: `quantity` ya son las piezas
  // realmente recibidas. Se guardan porque son la primera pista cuando el conteo
  // de cierre no cuadra.
  const surplus = toOptionalCount(entry.surplus);
  if (surplus === "invalid") {
    return { ok: false, error: `${entry.date}: los sobrantes deben ser piezas enteras y no negativas.` };
  }
  const missing = toOptionalCount(entry.missing);
  if (missing === "invalid") {
    return { ok: false, error: `${entry.date}: los faltantes deben ser piezas enteras y no negativos.` };
  }

  // El código manda sobre la etiqueta: si viene del catálogo, la etiqueta se
  // rellena sola con el nombre que ya usan en tienda. Así dos capturas del mismo
  // destino no acaban escritas de dos formas distintas.
  const rawCode = cleanText(entry.counterpartCode, 16);
  let counterpartCode: string | null = null;
  let counterpart = cleanText(entry.counterpart, 120);
  if (rawCode) {
    const known = findCounterpart(rawCode);
    if (!known) {
      return { ok: false, error: `${entry.date}: la contraparte «${rawCode}» no está en el catálogo de tiendas.` };
    }
    counterpartCode = known.code;
    counterpart = counterpart ?? counterpartLabel(known);
  }

  return {
    ok: true,
    value: {
      date,
      type,
      quantity,
      reference: cleanText(entry.reference, 64),
      document: cleanText(entry.document, 64),
      delivery: cleanText(entry.delivery, 64),
      counterpart,
      counterpartCode,
      surplus,
      missing,
      note,
      createdBy: cleanText(entry.createdBy, 64)
    }
  };
}

/** `null` si no se capturó, `"invalid"` si vino algo que no son piezas. */
function toOptionalCount(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = toNumber(raw);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
}

export type RoundEntry = {
  name: string;
  startDate: string;
  basePieces: number | string;
  countId?: string | null;
  note?: string | null;
};

export type NormalizedRound = {
  name: string;
  startDate: Date;
  basePieces: number;
  countId: string | null;
  note: string | null;
};

export type NormalizeRoundOutcome = { ok: true; value: NormalizedRound } | { ok: false; error: string };

/** Valida la apertura de una ronda: su nombre, su fecha y su base. */
export function normalizeRoundEntry(entry: RoundEntry, { today }: { today: Date }): NormalizeRoundOutcome {
  const name = cleanText(entry.name, 80);
  if (!name) return { ok: false, error: "La ronda necesita un nombre (por ejemplo «2da ronda 2026»)." };

  if (!DATE_PATTERN.test(entry.startDate ?? "")) {
    return { ok: false, error: `Fecha inválida (${String(entry.startDate)}), se espera AAAA-MM-DD.` };
  }
  const startDate = new Date(`${entry.startDate}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== entry.startDate) {
    return { ok: false, error: `Fecha inexistente (${entry.startDate}).` };
  }
  if (startDate.getTime() > today.getTime()) {
    return { ok: false, error: `${entry.startDate}: el inventario que abre la ronda no puede ser una fecha futura.` };
  }

  const basePieces = validatePieces(entry.basePieces, "La base de la ronda");
  if (typeof basePieces === "string") return { ok: false, error: basePieces };

  return {
    ok: true,
    value: { name, startDate, basePieces, countId: cleanText(entry.countId, 64), note: cleanText(entry.note, 500) }
  };
}

/** Devuelve las piezas, o el mensaje de error si no son válidas. */
export function validatePieces(raw: unknown, label: string): number | string {
  const pieces = toNumber(raw);
  if (pieces === null) return `${label} no es un número.`;
  if (!Number.isInteger(pieces)) return `${label} debe ser piezas enteras (${pieces}).`;
  if (pieces < 0) return `${label} no puede ser negativa.`;
  if (pieces > MAX_BASELINE) return `${label}: ${pieces} piezas parece un error de captura.`;
  return pieces;
}

export type KardexMovement = { type: InventoryMovementType; quantity: number };

export type KardexSummary = {
  /** Piezas del inventario que abrió la ronda. */
  basePieces: number;
  received: number;
  transferredIn: number;
  customerReturns: number;
  transferredOut: number;
  /** Pedidos en línea surtidos desde la tienda. Salida, igual que un traspaso. */
  shipFromStore: number;
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
  basePieces,
  movements,
  soldPieces
}: {
  basePieces: number;
  movements: KardexMovement[];
  soldPieces: number;
}): KardexSummary {
  const summary: KardexSummary = {
    basePieces,
    received: 0,
    transferredIn: 0,
    customerReturns: 0,
    transferredOut: 0,
    shipFromStore: 0,
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
      case "SFS":
        summary.shipFromStore += movement.quantity;
        break;
      case "AJUSTE_POSITIVO":
      case "AJUSTE_NEGATIVO":
        summary.adjustments += signedQuantity(movement.type, movement.quantity);
        break;
    }
  }

  summary.theoretical =
    basePieces +
    summary.received +
    summary.transferredIn +
    summary.customerReturns +
    summary.adjustments -
    summary.transferredOut -
    summary.shipFromStore -
    summary.sold;

  return summary;
}

/**
 * Diferencia de un conteo físico contra el teórico.
 *
 * Negativa = falta mercancía. Es la diferencia **de la ronda**: dentro de ella la
 * base nunca se toca, y cada inventario cierra una ronda y abre la siguiente con
 * las piezas recién contadas. Ver el comentario de `InventoryRound` en el esquema.
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
