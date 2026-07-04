import type ExcelJS from "exceljs";
import type { WeeklyCloseColumn } from "./weekly-close";

// Genera la hoja "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)" replicando el
// formato de tienda: encabezados azul marino, pérdidas en rojo/verde y
// columna TOTAL con los valores de tienda.

const BLUE = "FF2F5496";
const RED = "FFC00000";
const GREEN = "FF00B050";
const MONEY = '"$"#,##0.00';
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }
};

type SheetOptions = {
  storeName: string;
  weekNumber: number | null;
  rangeLabel: string;
  columns: WeeklyCloseColumn[];
  store: WeeklyCloseColumn;
};

export function buildWeeklyCloseSheet(workbook: ExcelJS.Workbook, options: SheetOptions) {
  const { storeName, weekNumber, rangeLabel, columns, store } = options;
  const sheet = workbook.addWorksheet(`Semana ${weekNumber ?? ""}`.trim(), { views: [{ showGridLines: false }] });
  const totalCol = 3 + columns.length; // A=sección, B=concepto, C.. asesores, última=TOTAL
  const center: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

  // Fila 1 — Tienda y semana
  const info = sheet.getRow(1);
  info.getCell(2).value = "TIENDA:";
  info.getCell(2).font = { bold: true, size: 11 };
  info.getCell(3).value = storeName;
  info.getCell(3).font = { bold: true, size: 12, underline: true };
  info.getCell(totalCol - 1).value = "SEMANA:";
  info.getCell(totalCol - 1).font = { bold: true, size: 11 };
  info.getCell(totalCol).value = weekNumber ?? rangeLabel;
  info.getCell(totalCol).font = { bold: true, size: 12 };
  info.getCell(totalCol).alignment = center;

  // Fila 2 — Título
  sheet.mergeCells(2, 1, 2, totalCol);
  const title = sheet.getCell(2, 1);
  title.value = "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)";
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  title.alignment = center;
  title.border = THIN;

  // Fila 3 — Encabezados de asesores
  const header = sheet.getRow(3);
  setHeaderCell(header.getCell(2), "ASESOR");
  columns.forEach((column, index) => setHeaderCell(header.getCell(3 + index), column.name));
  setHeaderCell(header.getCell(totalCol), "TOTAL");

  type RowSpec = {
    label: string;
    value: (column: WeeklyCloseColumn) => ExcelJS.CellValue;
    fmt?: string;
    total?: ExcelJS.CellValue;
    loss?: boolean;
  };
  const dash = (value: number | null, fmt?: (input: number) => ExcelJS.CellValue): ExcelJS.CellValue =>
    value === null ? "—" : fmt ? fmt(value) : value;
  const achievementLabel = (column: WeeklyCloseColumn) =>
    column.sales <= 0 ? "● 0%" : `${column.achievement >= 100 ? "★ " : ""}${Math.round(column.achievement)}%`;

  const pos: RowSpec[] = [
    { label: "META", value: (column) => column.goal, fmt: MONEY, total: store.goal },
    { label: "VENTA", value: (column) => column.sales, fmt: MONEY, total: store.sales },
    { label: "DIFERENCIA", value: (column) => column.difference, fmt: MONEY, total: store.difference },
    { label: "ALCANCE", value: achievementLabel, total: achievementLabel(store) },
    { label: "TICKETS", value: (column) => column.transactions, total: store.transactions },
    { label: "ARTICULOS", value: (column) => column.pieces, total: store.pieces },
    { label: "TRAFICO", value: (column) => dash(column.traffic), total: dash(store.traffic) }
  ];
  const indicators: RowSpec[] = [
    { label: "EPT", value: (column) => dash(column.ept), fmt: MONEY, total: dash(store.ept) },
    { label: "PERDIDA", value: (column) => dash(column.lossEpt), fmt: MONEY, loss: true },
    { label: "UPT", value: (column) => dash(column.upt), total: dash(store.upt) },
    { label: "PERDIDA", value: (column) => dash(column.lossUpt), fmt: MONEY, loss: true },
    { label: "AUR", value: (column) => dash(column.aur), fmt: MONEY, total: dash(store.aur) },
    { label: "PERDIDA", value: (column) => dash(column.lossAur), fmt: MONEY, loss: true },
    { label: "TC", value: (column) => dash(column.tc, (value) => `${value.toFixed(1)}%`), total: dash(store.tc, (value) => `${value.toFixed(1)}%`) }
  ];

  let rowIndex = 4;
  const writeSpec = (spec: RowSpec) => {
    const row = sheet.getRow(rowIndex);
    const label = row.getCell(2);
    label.value = spec.label;
    label.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    label.alignment = center;
    label.border = THIN;
    columns.forEach((column, index) => {
      const cell = row.getCell(3 + index);
      cell.value = spec.value(column);
      cell.alignment = center;
      cell.border = THIN;
      if (spec.fmt && typeof cell.value === "number") cell.numFmt = spec.fmt;
      cell.font = { bold: true, size: 10 };
      if (spec.loss && typeof cell.value === "number") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cell.value < 0 ? RED : GREEN } };
        cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      }
      if (spec.label === "ALCANCE") {
        cell.font = { bold: true, size: 11, color: { argb: column.sales <= 0 ? RED : "FF1F2937" } };
      }
    });
    const total = row.getCell(totalCol);
    if (spec.total !== undefined) {
      total.value = spec.total;
      if (spec.fmt && typeof spec.total === "number") total.numFmt = spec.fmt;
      total.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    }
    total.alignment = center;
    total.border = THIN;
    rowIndex += 1;
  };

  pos.forEach(writeSpec);
  const indicatorsStart = rowIndex;
  indicators.forEach(writeSpec);

  // Columna TOTAL: fusionar cada par KPI+PÉRDIDA mostrando el valor de tienda
  for (const offset of [0, 2, 4]) {
    sheet.mergeCells(indicatorsStart + offset, totalCol, indicatorsStart + offset + 1, totalCol);
  }

  // Etiquetas de sección verticales (col A)
  writeSectionLabel(sheet, 4, rowIndex - 8, "PUNTO DE VENTA");
  writeSectionLabel(sheet, indicatorsStart, rowIndex - 1, "INDICADORES");

  // Fila INDICADOR A TRABAJAR
  sheet.mergeCells(rowIndex, 1, rowIndex, 2);
  const focusLabel = sheet.getCell(rowIndex, 1);
  focusLabel.value = "INDICADOR A TRABAJAR";
  focusLabel.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  focusLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  focusLabel.alignment = center;
  focusLabel.border = THIN;
  const focusRow = sheet.getRow(rowIndex);
  columns.forEach((column, index) => {
    const cell = focusRow.getCell(3 + index);
    cell.value = column.focus;
    cell.alignment = center;
    cell.border = THIN;
    cell.font = {
      bold: true, size: 10,
      color: { argb: column.focus === "FELICIDADES" ? GREEN : column.focus === "SIN DATOS" ? "FF6B7280" : "FF1F2937" }
    };
  });
  focusRow.getCell(totalCol).border = THIN;
  rowIndex += 1;

  // Pie
  const footer = sheet.getCell(rowIndex + 1, 2);
  footer.value = `${rangeLabel} · Generado por Clarvex Team el ${new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`;
  footer.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };

  // Anchos
  sheet.getColumn(1).width = 4;
  sheet.getColumn(2).width = 22;
  for (let column = 3; column <= totalCol; column += 1) sheet.getColumn(column).width = 14;
  return sheet;
}

function setHeaderCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = THIN;
}

function writeSectionLabel(sheet: ExcelJS.Worksheet, fromRow: number, toRow: number, label: string) {
  sheet.mergeCells(fromRow, 1, toRow, 1);
  const cell = sheet.getCell(fromRow, 1);
  cell.value = label;
  cell.font = { bold: true, size: 8 };
  cell.alignment = { horizontal: "center", vertical: "middle", textRotation: 90 };
  cell.border = THIN;
}
