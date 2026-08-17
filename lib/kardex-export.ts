import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { getKardexState } from "@/lib/inventory-kardex";
import { buildSheetRows, exportTheoretical, type DailySale } from "@/lib/kardex-export-rows";
import {
  forceRecalcOnLoad,
  mapSheets,
  readPart,
  readRowTemplate,
  replaceDataRows,
  setDimension,
  setTableRows,
  writeCell
} from "@/lib/kardex-xlsx";
import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";

/**
 * Exporta el kardex en el MISMO archivo que la tienda manda a corporativo.
 *
 * La toma de inventario la hace un proveedor externo (RGIS) y el formato es de
 * corporativo, así que el archivo no se rediseña: se rellena. La plantilla
 * (`templates/kardex.xlsx`, generada con `scripts/build-kardex-template.ts`) es
 * su propio libro con las filas vaciadas; hojas, tablas, estilos, imágenes,
 * comentarios y fórmulas viajan intactos.
 *
 * **No se escribe ningún total.** El libro se marca para recalcular al abrirse y
 * son las fórmulas originales —`SUM(Tabla1[Piezas])`, los `COUNT`, el `VLOOKUP`
 * de la sucursal— las que los producen. Por eso el exportado sigue siendo una
 * hoja de trabajo y no una foto de números: si le añaden una fila, todo cuadra.
 */

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "kardex.xlsx");

/** Dónde empieza cada tabla del formato y en qué columna. */
const SHEETS = {
  ventas: { name: "Ventas", start: 8, column: 3 },
  recepcion: { name: "Recepción Mercancia", start: 7, column: 2 },
  enviadas: { name: "Trans. Enviadas", start: 7, column: 2 },
  recibidas: { name: "Trans. recibidas", start: 7, column: 2 },
  sfs: { name: "SFS", start: 7, column: 2 }
} as const;

/** Qué tabla vive en cada hoja, para ajustar su rango. */
const TABLE_OF_SHEET: Record<string, string> = {
  Ventas: "Tabla1",
  "Recepción Mercancia": "Tabla3",
  "Trans. Enviadas": "Tabla2",
  "Trans. recibidas": "Tabla4",
  SFS: "Tabla26"
};

export type KardexExport = { buffer: Buffer; filename: string; warnings: string[] };

export async function exportKardex(
  storeId: string,
  { roundId, apto }: { roundId?: string; apto?: string } = {}
): Promise<KardexExport | null> {
  const state = await getKardexState(storeId, roundId);
  if (!state.round || !state.summary) return null;

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });

  const daily = await prisma.kpi.groupBy({
    by: ["date"],
    where: {
      storeId,
      // Mismo corte que el kardex: el día del inventario entra en la ronda.
      date: { gte: state.round.startDate, ...(state.round.endDate ? { lte: state.round.endDate } : {}) },
      user: PERSON_WHERE
    },
    _sum: { pieces: true }
  });
  const sales: DailySale[] = daily.map((day) => ({ date: day.date, pieces: day._sum.pieces ?? 0 }));

  const { rows, totals } = buildSheetRows(state.movements, sales);

  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const sheetPaths = await mapSheets(zip);

  const blocks = [
    [SHEETS.ventas, rows.ventas],
    [SHEETS.recepcion, rows.recepcion],
    [SHEETS.enviadas, rows.enviadas],
    [SHEETS.recibidas, rows.recibidas],
    [SHEETS.sfs, rows.sfs]
  ] as const;

  for (const [sheet, data] of blocks) {
    const file = sheetPaths.get(sheet.name);
    if (!file) throw new Error(`La plantilla no tiene la hoja «${sheet.name}».`);
    let xml = await readPart(zip, file);
    const template = readRowTemplate(xml, sheet.start);
    const lastRow = sheet.start + Math.max(data.length, 1) - 1;
    xml = replaceDataRows(xml, sheet.start, sheet.column, [...data], template);
    xml = setDimension(xml, lastRow);
    zip.file(file, xml);

    await resizeTable(zip, TABLE_OF_SHEET[sheet.name], lastRow);
  }

  // Cabecera del resumen. Lo demás de esa hoja son fórmulas que se resuelven
  // solas al abrir: no se tocan.
  const resumenPath = sheetPaths.get("RESUMEN KARDEX")!;
  let resumen = await readPart(zip, resumenPath);
  resumen = writeCell(resumen, "C8", state.round.startDate);
  resumen = writeCell(resumen, "C9", state.round.basePieces);
  // El nombre de la tienda lo pone Clarvex, NO el catálogo de corporativo. La
  // celda traía un `VLOOKUP(F8, Hoja1!A:B)` que lo deducía del APTO; se
  // sustituye por el nombre real para que no dependa de tener ese código —y para
  // que no salga `#N/A` cuando no lo hay—. Es la única fórmula que se sobrescribe.
  if (store?.name) resumen = writeCell(resumen, "E9", store.name);
  // El APTO solo se escribe si se pide: en el kardex sirve para el desplegable
  // de destinos y orígenes de traspasos, no para nombrar la tienda.
  if (apto) resumen = writeCell(resumen, "F8", apto);
  // La existencia física solo se conoce al cerrar la ronda. Mientras tanto va
  // vacía a propósito: un cero se leería como «no quedó nada».
  resumen = writeCell(resumen, "I12", state.round.closingPieces);
  zip.file(resumenPath, resumen);

  zip.file("xl/workbook.xml", forceRecalcOnLoad(await readPart(zip, "xl/workbook.xml")));

  const warnings: string[] = [];
  if (totals.adjustments !== 0) {
    // Caso raro: la operación normal no lleva ajustes a media ronda. Cuando RGIS
    // cuenta y falta mercancía, es CORPORATIVO quien da de baja las piezas, y
    // eso entra como la base de la ronda siguiente —no como un ajuste dentro de
    // la que se cierra—. Ver el aviso de `AJUSTE` en `lib/inventory-kardex-entry`.
    warnings.push(
      `La ronda tiene ${rows.ajustes.length} ajuste(s) por ${totals.adjustments} piezas netas. El formato de corporativo no tiene dónde ponerlos, así que NO están en el archivo: su teórico saldrá ${Math.abs(totals.adjustments)} piezas ${totals.adjustments > 0 ? "por debajo" : "por encima"} del de Clarvex (${exportTheoretical(state.round.basePieces, totals)}).`
    );
  }
  if (state.round.closingPieces === null) {
    warnings.push("La ronda sigue abierta: la existencia física y la diferencia van vacías hasta cerrarla con el conteo de RGIS.");
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const slug = state.round.name.replace(/[^\p{L}\p{N}]+/gu, " ").trim().toUpperCase();
  return { buffer, filename: `KARDEX ${store?.name ?? storeId} ${slug}.xlsx`, warnings };
}

/** Ajusta el rango de la tabla por su nombre visible (`Tabla1`, `Tabla3`…). */
async function resizeTable(zip: JSZip, displayName: string | undefined, lastRow: number) {
  if (!displayName) return;
  for (const file of Object.keys(zip.files).filter((name) => /^xl\/tables\/table\d+\.xml$/.test(name))) {
    const xml = await readPart(zip, file);
    if (xml.includes(`displayName="${displayName}"`)) {
      zip.file(file, setTableRows(xml, lastRow));
      return;
    }
  }
}
