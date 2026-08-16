import { type InventoryMovementType } from "@/lib/inventory-kardex-entry";

/**
 * Reparto de los movimientos del kardex en las hojas del formato de la tienda.
 *
 * Vive aparte de `lib/kardex-export` porque ese módulo carga exceljs y Prisma.
 * Aquí solo hay reparto y sumas, que es lo que conviene tener cubierto por
 * pruebas: si una columna se corre de sitio, el archivo exportado sale mal sin
 * que nada falle.
 *
 * ⚠️ **Los ajustes no tienen hoja en el formato original.** La tienda no los
 * lleva. Se exportan en una hoja aparte y, cuando los hay, el teórico del
 * resumen deja de cuadrar con la resta a mano `entradas − salidas + base` que
 * muestra la hoja. Ver `buildKardexExport`.
 */

export type ExportMovement = {
  date: Date;
  /** Momento de captura. Desempata dos movimientos del mismo día. */
  createdAt?: Date;
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

/** Piezas vendidas de un día, tal como salen de KPIs. */
export type DailySale = { date: Date; pieces: number };

export type SheetRows = {
  /** Fecha · Piezas · Devolución de clientes */
  ventas: (Date | number)[][];
  /** Fecha · Caja/Folio · Piezas · Entrega · Manifiesto · Quién recibe · Sobrantes · Faltantes */
  recepcion: (Date | string | number | null)[][];
  /** Fecha · Folio · Piezas · SMI · Destino · Quién recolecta */
  enviadas: (Date | string | number | null)[][];
  /** Fecha · Folio · Piezas · Origen · Quién recibe */
  recibidas: (Date | string | number | null)[][];
  /** Fecha · Pedido · Piezas · Folio · Comentario */
  sfs: (Date | string | number | null)[][];
  /** Fecha · Tipo · Piezas · Motivo · Quién */
  ajustes: (Date | string | number | null)[][];
};

export type ExportTotals = {
  soldPieces: number;
  customerReturns: number;
  netSales: number;
  received: number;
  receivedBoxes: number;
  surplus: number;
  missing: number;
  transferredIn: number;
  transferredInBoxes: number;
  transferredOut: number;
  transferredOutCount: number;
  shipFromStore: number;
  shipFromStoreCount: number;
  totalIn: number;
  totalOut: number;
  adjustments: number;
};

/**
 * Orden del archivo exportado: por día y, dentro del día, por orden de captura.
 *
 * El desempate importa: el estado del kardex viene ordenado del más reciente al
 * más antiguo (así lo quiere la pantalla), y sin él dos recepciones del mismo día
 * salían invertidas respecto a como se capturaron.
 */
const byDate = (left: ExportMovement, right: ExportMovement) =>
  left.date.getTime() - right.date.getTime() ||
  (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0);

/**
 * Convierte los movimientos en filas por hoja y saca los totales.
 *
 * Las devoluciones NO son una hoja: en el formato de la tienda son una columna
 * de «Ventas», junto a las piezas del día. Por eso se agrupan por fecha contra
 * las ventas de KPIs en vez de listarse aparte.
 */
export function buildSheetRows(movements: ExportMovement[], sales: DailySale[]): { rows: SheetRows; totals: ExportTotals } {
  const rows: SheetRows = { ventas: [], recepcion: [], enviadas: [], recibidas: [], sfs: [], ajustes: [] };
  const totals: ExportTotals = {
    soldPieces: 0,
    customerReturns: 0,
    netSales: 0,
    received: 0,
    receivedBoxes: 0,
    surplus: 0,
    missing: 0,
    transferredIn: 0,
    transferredInBoxes: 0,
    transferredOut: 0,
    transferredOutCount: 0,
    shipFromStore: 0,
    shipFromStoreCount: 0,
    totalIn: 0,
    totalOut: 0,
    adjustments: 0
  };

  // Las devoluciones se suman por día para casarlas con la venta de ese día.
  const returnsByDay = new Map<number, number>();

  for (const movement of [...movements].sort(byDate)) {
    switch (movement.type) {
      case "RECEPCION":
        rows.recepcion.push([
          movement.date,
          movement.reference,
          movement.quantity,
          movement.delivery,
          movement.document,
          movement.createdBy,
          movement.surplus ?? 0,
          movement.missing ?? 0
        ]);
        totals.received += movement.quantity;
        totals.receivedBoxes += 1;
        totals.surplus += movement.surplus ?? 0;
        totals.missing += movement.missing ?? 0;
        break;

      case "TRANSFERENCIA_ENTRADA":
        rows.recibidas.push([
          movement.date,
          movement.reference,
          movement.quantity,
          counterpartText(movement),
          movement.createdBy
        ]);
        totals.transferredIn += movement.quantity;
        totals.transferredInBoxes += 1;
        break;

      case "TRANSFERENCIA_SALIDA":
        rows.enviadas.push([
          movement.date,
          movement.reference,
          movement.quantity,
          null, // SMI: no se captura; la columna existe en el formato y va vacía
          counterpartText(movement),
          movement.createdBy
        ]);
        totals.transferredOut += movement.quantity;
        totals.transferredOutCount += 1;
        break;

      case "SFS":
        rows.sfs.push([movement.date, movement.reference, movement.quantity, movement.document, movement.note]);
        totals.shipFromStore += movement.quantity;
        totals.shipFromStoreCount += 1;
        break;

      case "DEVOLUCION_CLIENTE": {
        const key = movement.date.getTime();
        returnsByDay.set(key, (returnsByDay.get(key) ?? 0) + movement.quantity);
        totals.customerReturns += movement.quantity;
        break;
      }

      case "AJUSTE_POSITIVO":
      case "AJUSTE_NEGATIVO": {
        const signo = movement.type === "AJUSTE_POSITIVO" ? 1 : -1;
        rows.ajustes.push([
          movement.date,
          movement.type === "AJUSTE_POSITIVO" ? "A favor" : "En contra",
          movement.quantity,
          movement.note,
          movement.createdBy
        ]);
        totals.adjustments += signo * movement.quantity;
        break;
      }
    }
  }

  // Un día con devolución pero sin venta también tiene que aparecer: si no, esa
  // devolución desaparece de la hoja aunque esté sumada en el total.
  const days = new Map<number, { pieces: number; returns: number }>();
  for (const sale of sales) {
    days.set(sale.date.getTime(), { pieces: sale.pieces, returns: 0 });
    totals.soldPieces += sale.pieces;
  }
  for (const [key, returned] of returnsByDay) {
    const day = days.get(key);
    if (day) day.returns = returned;
    else days.set(key, { pieces: 0, returns: returned });
  }
  for (const key of [...days.keys()].sort((left, right) => left - right)) {
    const day = days.get(key)!;
    rows.ventas.push([new Date(key), day.pieces, day.returns]);
  }

  totals.netSales = totals.soldPieces - totals.customerReturns;
  totals.totalIn = totals.received + totals.transferredIn;
  totals.totalOut = totals.netSales + totals.shipFromStore + totals.transferredOut;

  return { rows, totals };
}

/**
 * Lo que se escribe en la columna de destino/origen.
 *
 * Se antepone el APTO cuando se conoce: es lo único que distingue las dos
 * tiendas de Cuernavaca (`03036` y `03049`) al leer el archivo después.
 */
function counterpartText(movement: ExportMovement): string | null {
  if (!movement.counterpart) return movement.counterpartCode;
  if (!movement.counterpartCode || movement.counterpartCode === movement.counterpart) return movement.counterpart;
  return `${movement.counterpartCode} ${movement.counterpart}`;
}

/**
 * Existencia teórica del formato: `entradas − salidas + base`.
 *
 * Es la fórmula literal de la celda `I8` de su resumen (`C14-F15+C9`). Los
 * ajustes se suman aparte porque el formato original no los contempla.
 */
export function exportTheoretical(basePieces: number, totals: ExportTotals): number {
  return basePieces + totals.totalIn - totals.totalOut + totals.adjustments;
}
