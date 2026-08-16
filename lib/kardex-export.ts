import path from "node:path";
import ExcelJS from "exceljs";
import { getKardexState } from "@/lib/inventory-kardex";
import { buildSheetRows, exportTheoretical, type DailySale } from "@/lib/kardex-export-rows";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

/**
 * Exporta el kardex al formato XLSX que la tienda ya entrega.
 *
 * La plantilla (`templates/kardex.xlsx`) es su propio archivo con los datos
 * vaciados: se conservan hojas, encabezados, formato y fórmulas.
 *
 * ⚠️ **En el archivo exportado los totales se escriben como VALORES, no como
 * fórmulas.** exceljs no recalcula, y las sumas del formato apuntan a tablas de
 * Excel (`SUM(Tabla1[Piezas])`) cuyo rango no se extiende solo al añadir filas
 * desde código: dejarlas como fórmula daría totales en cero o los de la ronda
 * anterior. Escribir el número garantiza que el archivo abre correcto.
 *
 * La consecuencia hay que saberla: **el exportado es un reporte, no una hoja de
 * trabajo**. Si alguien le añade una fila a mano, los totales no se mueven.
 */

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "kardex.xlsx");

/**
 * Dónde empieza y hasta dónde llega la tabla de cada hoja del formato.
 *
 * `lastColumn` no siempre coincide con el número de datos que se escriben: en
 * «Trans. Enviadas» la columna SMI existe en el formato y va vacía, y aun así
 * tiene que llevar borde para que la tabla no se vea partida.
 */
const DATA_START = {
  ventas: { sheet: "Ventas", row: 8, column: 3, lastColumn: 5 },
  recepcion: { sheet: "Recepción Mercancia", row: 7, column: 2, lastColumn: 9 },
  enviadas: { sheet: "Trans. Enviadas", row: 7, column: 2, lastColumn: 7 },
  recibidas: { sheet: "Trans. recibidas", row: 7, column: 2, lastColumn: 6 },
  sfs: { sheet: "SFS", row: 7, column: 2, lastColumn: 6 }
} as const;

export type KardexExport = { buffer: Buffer; filename: string; warnings: string[] };

export async function exportKardex(storeId: string, roundId?: string): Promise<KardexExport | null> {
  const state = await getKardexState(storeId, roundId);
  if (!state.round || !state.summary) return null;

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });

  // Ventas por DÍA, con el mismo corte que el kardex: posteriores al inventario
  // que abre la ronda y hasta el cierre si ya cerró.
  const daily = await prisma.kpi.groupBy({
    by: ["date"],
    where: {
      storeId,
      date: { gt: state.round.startDate, ...(state.round.endDate ? { lte: state.round.endDate } : {}) },
      user: PERSON_WHERE
    },
    _sum: { pieces: true }
  });
  const sales: DailySale[] = daily.map((day) => ({ date: day.date, pieces: day._sum.pieces ?? 0 }));

  const { rows, totals } = buildSheetRows(state.movements, sales);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  writeRows(workbook, DATA_START.ventas, rows.ventas);
  writeRows(workbook, DATA_START.recepcion, rows.recepcion);
  writeRows(workbook, DATA_START.enviadas, rows.enviadas);
  writeRows(workbook, DATA_START.recibidas, rows.recibidas);
  writeRows(workbook, DATA_START.sfs, rows.sfs);

  // Totales de cada hoja, como valor (ver el aviso de arriba).
  setValues(workbook, "Ventas", { D3: totals.soldPieces, D4: totals.customerReturns, D5: totals.netSales });
  setValues(workbook, "Recepción Mercancia", {
    D3: totals.receivedBoxes,
    F3: totals.surplus,
    D4: totals.received,
    F4: totals.missing
  });
  setValues(workbook, "Trans. Enviadas", { D3: totals.transferredOutCount, D4: totals.transferredOut });
  setValues(workbook, "Trans. recibidas", { D3: totals.transferredInBoxes, D4: totals.transferredIn });
  setValues(workbook, "SFS", { D3: totals.shipFromStoreCount, D4: totals.shipFromStore });

  const theoretical = exportTheoretical(state.round.basePieces, totals);
  const counted = state.round.closingPieces;

  setValues(workbook, "RESUMEN KARDEX", {
    C8: state.round.startDate,
    C9: state.round.basePieces,
    E9: store?.name ?? "",
    C12: totals.received,
    C13: totals.transferredIn,
    C14: totals.totalIn,
    F12: totals.netSales,
    F13: totals.shipFromStore,
    F14: totals.transferredOut,
    F15: totals.totalOut,
    I8: theoretical,
    I9: theoretical,
    // La existencia física solo se conoce al cerrar la ronda. Mientras tanto se
    // deja vacía a propósito: un cero se leería como «no quedó nada».
    I12: counted,
    I13: counted,
    I14: counted === null ? null : counted - theoretical,
    I16: counted === null || theoretical === 0 ? null : (counted - theoretical) / theoretical
  });

  const warnings: string[] = [];
  if (totals.adjustments !== 0) {
    warnings.push(
      `La ronda tiene ${rows.ajustes.length} ajuste(s) por ${totals.adjustments} piezas netas. El formato original no los contempla: van en la hoja «Ajustes» y el teórico del resumen ya los incluye, por lo que la resta a mano «entradas − salidas + base» no cuadrará con él.`
    );
    writeAdjustmentsSheet(workbook, rows.ajustes);
  }
  if (counted === null) {
    warnings.push("La ronda sigue abierta: la existencia física y la diferencia van vacías hasta que se cierre con el conteo.");
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const slug = state.round.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toUpperCase();
  return { buffer, filename: `KARDEX ${store?.name ?? storeId} ${slug}.xlsx`, warnings };
}

/** Azules del formato: los mismos que llevaba el estilo de tabla original. */
const BORDE = "FFB4C6E7";
const BANDA = "FFD9E2F3";

/**
 * Escribe las filas de una hoja con el aspecto de tabla del formato.
 *
 * Los bordes y el sombreado alterno los ponía el **estilo de tabla de Excel**, y
 * las tablas hubo que quitarlas de la plantilla porque exceljs las escribía rotas
 * y obligaban a Excel a reparar el archivo. Al desaparecer, las filas quedaban
 * lisas: aquí se repone el aspecto celda por celda.
 */
function writeRows(
  workbook: ExcelJS.Workbook,
  target: { sheet: string; row: number; column: number; lastColumn: number },
  rows: (Date | string | number | null)[][]
) {
  const sheet = workbook.getWorksheet(target.sheet);
  if (!sheet) throw new Error(`La plantilla no tiene la hoja «${target.sheet}».`);
  rows.forEach((values, index) => {
    const row = sheet.getRow(target.row + index);
    values.forEach((value, offset) => {
      row.getCell(target.column + offset).value = value ?? null;
    });
    // El borde llega hasta la última columna del formato, no solo hasta donde
    // hubo dato: una celda vacía sin borde parte la tabla visualmente.
    for (let column = target.column; column <= target.lastColumn; column++) {
      const cell = row.getCell(column);
      cell.border = {
        top: { style: "thin", color: { argb: BORDE } },
        left: { style: "thin", color: { argb: BORDE } },
        bottom: { style: "thin", color: { argb: BORDE } },
        right: { style: "thin", color: { argb: BORDE } }
      };
      if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BANDA } };
    }
    row.commit();
  });
}

function setValues(workbook: ExcelJS.Workbook, sheetName: string, cells: Record<string, unknown>) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`La plantilla no tiene la hoja «${sheetName}».`);
  for (const [address, value] of Object.entries(cells)) {
    sheet.getCell(address).value = (value ?? null) as ExcelJS.CellValue;
  }
}

/**
 * Hoja de ajustes, creada solo si los hay.
 *
 * No existe en el formato de la tienda —no llevan ajustes— pero un ajuste que no
 * aparece en ningún lado es justo lo que este kardex existe para evitar.
 */
function writeAdjustmentsSheet(workbook: ExcelJS.Workbook, rows: (Date | string | number | null)[][]) {
  const sheet = workbook.addWorksheet("Ajustes");
  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Piezas", key: "piezas", width: 10 },
    { header: "Motivo", key: "motivo", width: 60 },
    { header: "Quién", key: "quien", width: 22 }
  ];
  sheet.getRow(1).font = { bold: true };
  for (const values of rows) sheet.addRow(values);
}
