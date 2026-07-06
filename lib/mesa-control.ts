import type ExcelJS from "exceljs";

// Rellena la plantilla oficial "Mesa de Control" (Grupo AXO) con los datos de
// un conteo. La plantilla (templates/mesa-de-control.xlsx) conserva intactos
// estilos, instructivo y fórmulas: aquí SOLO se escriben celdas de captura.
//
// Mapa de celdas (verificado contra el archivo original):
//   Resumen!D9              → fecha (las hojas de detalle la heredan por fórmula)
//   Resumen!F19             → inventario teórico (Kardex)
//   Resumen!G20             → diferencia previa manual (se limpia)
//   Resumen!G24/G25/G26-28  → gerente / subgerente / vendedores
//   Resumen!K24-K29         → vendedores adicionales
//   Detalle filas 14+:  B=No Marbete · C=1er · D=2do · F=3er
//   (E=Diferencia, H=Real y J=Validación son fórmulas de la plantilla)

export type MesaControlRow = {
  number: number;
  count1: number | null;
  count2: number | null;
  count3: number | null;
};

export type MesaControlData = {
  date: Date;
  // Nombre de la tienda → Resumen!D8; las hojas de detalle lo heredan por fórmula.
  sucursal: string;
  theoretical: number | null;
  piso: MesaControlRow[];
  bodega: MesaControlRow[];
  noUpc: Array<{ concept: string; pieces: number }>;
  team: { gerente: string | null; subgerente: string | null; vendedores: string[] };
};

const SHEETS = {
  piso: { name: "Piso de Venta", firstRow: 14, lastRow: 1209 },
  bodega: { name: "Bodega", firstRow: 14, lastRow: 1203 },
  noUpc: { name: "Piezas Sin UPC", firstRow: 14, lastRow: 18 }
} as const;

export function fillMesaControl(workbook: ExcelJS.Workbook, data: MesaControlData): void {
  // Que Excel recalcule todas las fórmulas al abrir (exceljs no trae motor
  // de cálculo, así que los resultados cacheados de la plantilla ya no valen).
  workbook.calcProperties.fullCalcOnLoad = true;

  const resumen = workbook.getWorksheet("Resumen");
  if (!resumen) throw new Error("La plantilla no tiene la hoja Resumen.");

  resumen.getCell("D8").value = data.sucursal;
  resumen.getCell("D9").value = data.date;
  resumen.getCell("F19").value = data.theoretical;
  resumen.getCell("G20").value = null; // diferencia previa manual del conteo de la plantilla

  // Colaboradores
  const nameCells = ["G26", "G27", "G28", "K24", "K25", "K26", "K27", "K28", "K29"];
  resumen.getCell("G24").value = data.team.gerente;
  resumen.getCell("G25").value = data.team.subgerente;
  nameCells.forEach((address, index) => {
    resumen.getCell(address).value = data.team.vendedores[index] ?? null;
  });

  fillZone(workbook, SHEETS.piso, data.piso);
  fillZone(workbook, SHEETS.bodega, data.bodega);

  // Piezas Sin UPC: concepto en B, piezas contadas en C (1er conteo).
  const noUpcSheet = workbook.getWorksheet(SHEETS.noUpc.name);
  if (noUpcSheet) {
    for (let row = SHEETS.noUpc.firstRow; row <= SHEETS.noUpc.lastRow; row += 1) {
      const item = data.noUpc[row - SHEETS.noUpc.firstRow] ?? null;
      noUpcSheet.getCell(`B${row}`).value = item ? item.concept : null;
      noUpcSheet.getCell(`C${row}`).value = item ? item.pieces : null;
      noUpcSheet.getCell(`D${row}`).value = null;
      noUpcSheet.getCell(`F${row}`).value = null;
    }
  }
}

function fillZone(
  workbook: ExcelJS.Workbook,
  sheet: { name: string; firstRow: number; lastRow: number },
  rows: MesaControlRow[]
): void {
  const worksheet = workbook.getWorksheet(sheet.name);
  if (!worksheet) throw new Error(`La plantilla no tiene la hoja ${sheet.name}.`);
  const ordered = [...rows].sort((left, right) => left.number - right.number);
  // Limpiar lo justo: las filas con datos previos de la plantilla más las
  // nuestras (las fórmulas E/H/J de cada fila no se tocan).
  const usedRows = Math.min(sheet.lastRow - sheet.firstRow + 1, Math.max(ordered.length + 40, 220));
  for (let offset = 0; offset < usedRows; offset += 1) {
    const rowNumber = sheet.firstRow + offset;
    const entry = ordered[offset] ?? null;
    worksheet.getCell(`B${rowNumber}`).value = entry ? entry.number : null;
    worksheet.getCell(`C${rowNumber}`).value = entry ? entry.count1 : null;
    worksheet.getCell(`D${rowNumber}`).value = entry ? entry.count2 : null;
    worksheet.getCell(`F${rowNumber}`).value = entry ? entry.count3 : null;
  }
}
