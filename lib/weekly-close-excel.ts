import type ExcelJS from "exceljs";
import type { WeeklyCloseColumn } from "./weekly-close";

// Réplica exacta del formato de tienda "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)"
// (hoja RDS del archivo de referencia): mismas columnas (C=concepto, D–M=10
// asesores, O=TOTAL), colores, bordes, formato condicional (escala rojo→verde
// en pérdidas, amarillo en celdas vacías) e iconos (estrella ≥100%, semáforo).

const BLUE = "FF305496";           // tema 4 con tinte -25% (encabezados)
const WHITE = "FFFFFFFF";
const MONEY = '"$"#,##0.00';
const PCT = "0%";
const FIRST_DATA_COL = 4;          // D
const ADVISOR_SLOTS = 10;          // D..M como la referencia
const TOTAL_COL = FIRST_DATA_COL + ADVISOR_SLOTS + 1; // O (N es separador)

const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }
};
const medium: Partial<ExcelJS.Borders> = {
  top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" }
};
const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle", wrapText: true };

type SheetOptions = {
  storeName: string;
  weekNumber: number | null;
  rangeLabel: string;
  columns: WeeklyCloseColumn[];
  store: WeeklyCloseColumn;
};

export function buildWeeklyCloseSheet(workbook: ExcelJS.Workbook, options: SheetOptions) {
  const { storeName, weekNumber, rangeLabel, columns, store } = options;
  const sheet = workbook.addWorksheet("RDS", { views: [{ showGridLines: false }] });

  // Anchos de columna idénticos a la referencia
  sheet.getColumn(1).width = 1.6;
  sheet.getColumn(2).width = 1.6;
  sheet.getColumn(3).width = 19.8;
  for (let column = FIRST_DATA_COL; column < FIRST_DATA_COL + ADVISOR_SLOTS; column += 1) sheet.getColumn(column).width = 10.8;
  sheet.getColumn(TOTAL_COL - 1).width = 0.8;
  sheet.getColumn(TOTAL_COL).width = 12.8;
  for (const rowNumber of [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28, 29]) {
    sheet.getRow(rowNumber).height = 20.1;
  }

  // Fila 2 — TIENDA / SEMANA
  const g2 = sheet.getCell(2, 7);
  g2.value = "TIENDA:";
  g2.font = { name: "Calibri", size: 9 };
  g2.alignment = { horizontal: "right", vertical: "middle" };
  sheet.mergeCells(2, 8, 2, 11);
  const name = sheet.getCell(2, 8);
  name.value = storeName;
  name.font = { name: "Calibri", bold: true, size: 13 };
  name.alignment = { horizontal: "center", vertical: "middle" };
  name.border = { bottom: { style: "thin" } };
  const l2 = sheet.getCell(2, 12);
  l2.value = "SEMANA:";
  l2.font = { name: "Calibri", size: 9 };
  l2.alignment = { horizontal: "right", vertical: "middle" };
  const m2 = sheet.getCell(2, 13);
  m2.value = weekNumber ?? rangeLabel;
  m2.font = { name: "Calibri", bold: true, size: 13 };
  m2.alignment = { horizontal: "center", vertical: "middle" };
  m2.border = { bottom: { style: "thin" } };

  // Filas 4-5 — Banda de título azul
  sheet.mergeCells(4, 3, 5, TOTAL_COL);
  const title = sheet.getCell(4, 3);
  title.value = "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)";
  title.font = { name: "Calibri", bold: true, size: 18, color: { argb: WHITE } };
  title.fill = solid(BLUE);
  title.alignment = center;
  title.border = thin;

  const label = (rowNumber: number, text: string) => {
    const cell = sheet.getCell(rowNumber, 3);
    cell.value = text;
    cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = solid(BLUE);
    cell.alignment = center;
    cell.border = thin;
  };
  const totalCell = (rowNumber: number, value: ExcelJS.CellValue, numFmt?: string, size = 9) => {
    const cell = sheet.getCell(rowNumber, TOTAL_COL);
    cell.value = value;
    if (numFmt) cell.numFmt = numFmt;
    cell.font = { name: "Calibri", bold: true, size, color: { argb: WHITE } };
    cell.fill = solid(BLUE);
    cell.alignment = center;
    cell.border = thin;
  };
  const dataRow = (rowNumber: number, get: (column: WeeklyCloseColumn) => ExcelJS.CellValue, opts: { numFmt?: string; size?: number; border?: Partial<ExcelJS.Borders> } = {}) => {
    for (let slot = 0; slot < ADVISOR_SLOTS; slot += 1) {
      const cell = sheet.getCell(rowNumber, FIRST_DATA_COL + slot);
      const column = columns[slot];
      cell.value = column ? get(column) : null;
      if (opts.numFmt) cell.numFmt = opts.numFmt;
      cell.font = { name: "Calibri", size: opts.size ?? 9 };
      cell.alignment = center;
      cell.border = opts.border ?? thin;
    }
  };

  // Fila 6 — Encabezado de asesores
  label(6, "ASESOR");
  for (let slot = 0; slot < ADVISOR_SLOTS; slot += 1) {
    const cell = sheet.getCell(6, FIRST_DATA_COL + slot);
    cell.value = columns[slot]?.name ?? null;
    cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: WHITE } };
    cell.fill = solid(BLUE);
    cell.alignment = center;
    cell.border = thin;
  }
  totalCell(6, "TOTAL");

  // PUNTO DE VENTA (filas 7-13)
  label(7, "META");        dataRow(7, (column) => column.goal, { numFmt: MONEY });                 totalCell(7, store.goal, MONEY);
  label(8, "VENTA");       dataRow(8, (column) => column.sales, { numFmt: MONEY });                totalCell(8, store.sales, MONEY);
  label(9, "DIFERENCIA");  dataRow(9, (column) => column.difference, { numFmt: MONEY });           totalCell(9, store.difference, MONEY);
  label(10, "ALCANCE");    dataRow(10, (column) => column.achievement / 100, { numFmt: PCT, size: 12 }); totalCell(10, store.achievement / 100, PCT, 12);
  label(11, "TICKETS");    dataRow(11, (column) => column.transactions);                           totalCell(11, store.transactions);
  label(12, "ARTICULOS");  dataRow(12, (column) => column.pieces);                                 totalCell(12, store.pieces);
  label(13, "TRAFICO");    dataRow(13, (column) => column.traffic);                                totalCell(13, store.traffic ?? "—");
  sectionLabel(sheet, 6, 13, "PUNTO DE VENTA");

  // INDICADORES (filas 15-21) — pares KPI/PÉRDIDA con escala rojo→verde
  label(15, "EPT");        dataRow(15, (column) => column.ept ?? null, { numFmt: MONEY });
  label(16, "PERDIDA");    dataRow(16, (column) => column.lossEpt ?? null, { numFmt: MONEY, border: medium });
  label(17, "UPT");        dataRow(17, (column) => column.upt ?? null, { numFmt: "0.00" });
  label(18, "PERDIDA");    dataRow(18, (column) => column.lossUpt ?? null, { numFmt: MONEY, border: medium });
  label(19, "AUR");        dataRow(19, (column) => column.aur ?? null, { numFmt: MONEY });
  label(20, "PERDIDA");    dataRow(20, (column) => column.lossAur ?? null, { numFmt: MONEY, border: medium });
  label(21, "TC");         dataRow(21, (column) => column.tc === null ? null : column.tc / 100, { numFmt: "0.0%", size: 12 });
  sheet.mergeCells(15, TOTAL_COL, 16, TOTAL_COL); totalCell(15, store.ept ?? "—", MONEY);
  sheet.mergeCells(17, TOTAL_COL, 18, TOTAL_COL); totalCell(17, store.upt ?? "—", "0.00");
  sheet.mergeCells(19, TOTAL_COL, 20, TOTAL_COL); totalCell(19, store.aur ?? "—", MONEY);
  totalCell(21, store.tc === null ? "—" : store.tc / 100, "0.0%", 12);
  sectionLabel(sheet, 15, 21, "INDICADORES");

  // Fila 23 — INDICADOR A TRABAJAR
  sheet.mergeCells(23, 1, 23, 3);
  const focusLabel = sheet.getCell(23, 1);
  focusLabel.value = "INDICADOR A TRABAJAR";
  focusLabel.font = { name: "Calibri", bold: true, size: 9, color: { argb: WHITE } };
  focusLabel.fill = solid(BLUE);
  focusLabel.alignment = center;
  focusLabel.border = thin;
  dataRow(23, (column) => column.focus);

  // WHATSAPP (filas 25-29)
  label(25, "META");       dataRow(25, (column) => column.waMeta ?? null, { numFmt: MONEY });      totalCell(25, store.waMeta ?? "—", MONEY);
  label(26, "VENTA");      dataRow(26, (column) => column.waSales ?? null, { numFmt: MONEY });     totalCell(26, store.waSales ?? "—", MONEY);
  label(27, "ALCANCE");    dataRow(27, (column) => waAchievement(column), { numFmt: PCT, size: 12 }); totalCell(27, waAchievement(store) ?? "—", PCT, 12);
  label(28, "TICKETS");    dataRow(28, (column) => column.waTransactions ?? null);                 totalCell(28, store.waTransactions ?? "—");
  label(29, "ARTICULOS");  dataRow(29, (column) => column.waPieces ?? null);                       totalCell(29, store.waPieces ?? "—");
  sectionLabel(sheet, 25, 29, "WHATSAPP");

  // Pie discreto con el periodo
  const footer = sheet.getCell(31, 3);
  footer.value = `${rangeLabel} · Generado por Clarvex Team el ${new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`;
  footer.font = { name: "Calibri", size: 8, italic: true, color: { argb: "FF808080" } };

  addConditionalFormats(sheet);
  return sheet;
}

function waAchievement(column: WeeklyCloseColumn): number | null {
  if (column.waMeta === null || column.waMeta <= 0 || column.waSales === null) return null;
  return column.waSales / column.waMeta;
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function sectionLabel(sheet: ExcelJS.Worksheet, fromRow: number, toRow: number, text: string) {
  sheet.mergeCells(fromRow, 2, toRow, 2);
  const cell = sheet.getCell(fromRow, 2);
  cell.value = text;
  cell.font = { name: "Calibri", bold: true, size: 9 };
  cell.alignment = { horizontal: "center", vertical: "middle", textRotation: 90 };
  cell.border = thin;
}

function addConditionalFormats(sheet: ExcelJS.Worksheet) {
  // Celdas vacías en amarillo (asesores sin datos), como la referencia
  sheet.addConditionalFormatting({
    ref: "D8:M8 D11:M13 D23:M23 D26:M26 D28:M29",
    rules: [{
      type: "containsText", operator: "containsBlanks", priority: 11,
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFFF00" } } }
    }]
  });
  // PÉRDIDAS: escala de color rojo (negativo) → verde (positivo)
  const scale = (ref: string, priority: number, max: number) => sheet.addConditionalFormatting({
    ref,
    rules: [{
      type: "colorScale", priority,
      cfvo: [{ type: "num", value: -1 }, { type: "num", value: max }],
      color: [{ argb: "FFFF0000" }, { argb: "FF00B050" }]
    }]
  });
  scale("D16:M16", 3, 0);
  scale("D18:M18", 2, 1);
  scale("D20:M20", 1, 1);
  // ALCANCE: semáforo rojo bajo / estrella dorada al llegar (mismos umbrales
  // que la referencia: 85% en punto de venta, 99% en WhatsApp)
  // `custom: true` obliga a exceljs a escribir la regla como x14 (extensión)
  // con los iconos mezclados: semáforo rojo/amarillo + estrella dorada ≥100%.
  const icons = (ref: string, priority: number, mid: number) => sheet.addConditionalFormatting({
    ref,
    rules: [{
      type: "iconSet", priority, iconSet: "3TrafficLights1", reverse: false, showValue: true, custom: true,
      cfvo: [{ type: "percent", value: 0 }, { type: "num", value: mid }, { type: "num", value: 1 }],
      icons: [
        { iconSet: "3TrafficLights1", iconId: 0 },
        { iconSet: "3TrafficLights1", iconId: 1 },
        { iconSet: "3Stars", iconId: 2 }
      ]
    } as unknown as ExcelJS.ConditionalFormattingRule]
  });
  icons("O10 D10:M10", 18, 0.85);
  icons("O27 D27:M27", 19, 0.99);
}
