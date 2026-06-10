import * as XLSX from "@/lib/spreadsheet";

export type DiscountRecord = {
  employeeNumber: string;
  weekNumber: number;
  grossSales: number;
  discountAmount: number;
  discountMargin: number;
};

export type StoreTotalDiscount = {
  weekNumber: number;
  grossSales: number;
  discountAmount: number;
  discountMargin: number;
};

export type ParsedDiscountWorkbook = {
  records: DiscountRecord[];
  storeTotals: StoreTotalDiscount[];
  weekNumbers: number[];
  employeeNumbers: string[];
};

const DISCOUNT_SHEET_NAMES = ["Margen DTO", "DESCUENTOS POS", "Descuentos", "Margen"];

function normalizeSheetName(name: string) {
  return name.trim().toUpperCase();
}

export function parsePosDiscountWorkbook(workbook: XLSX.WorkBook): ParsedDiscountWorkbook {
  const sheetName = workbook.SheetNames.find((name) =>
    DISCOUNT_SHEET_NAMES.some((candidate) => normalizeSheetName(name) === normalizeSheetName(candidate))
  );
  if (!sheetName) {
    throw new Error(
      `No se encontro una hoja de descuentos. Hojas disponibles: ${workbook.SheetNames.join(", ")}`
    );
  }

  const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true
  }) as unknown[][];

  console.log(`[DISCOUNT-SYNC] Hoja: "${sheetName}" | Total filas: ${allRows.length}`);
  const preview = allRows.slice(0, 20);
  preview.forEach((row, i) => {
    if (Array.isArray(row) && row.some((v) => v != null)) {
      console.log(`[DISCOUNT-SYNC] fila[${i}]:`, JSON.stringify(row));
    }
  });

  const hasDiscountData = allRows.some((row) => {
    if (!Array.isArray(row)) return false;
    return row.some((col) => col != null && String(col).trim().toUpperCase().startsWith("SEMANA"));
  });
  if (!hasDiscountData) {
    throw new Error(`La hoja "${sheetName}" no contiene bloques SEMANA. Verifica el formato del archivo.`);
  }

  // Skip rows 1-5 (empty headers) — data starts at row 6
  const rows = allRows.slice(5);

  const records: DiscountRecord[] = [];
  const storeTotals: StoreTotalDiscount[] = [];
  let currentWeekNumber = 0;

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;

    const col1 = row[1];
    const col2 = row[2];
    const col1Text = col1 != null ? String(col1).trim() : "";

    // Detect SEMANA XX header row
    if (col1Text.toUpperCase().startsWith("SEMANA")) {
      const numMatch = col1Text.match(/\d+/);
      if (numMatch) currentWeekNumber = parseInt(numMatch[0], 10);
      continue;
    }

    if (currentWeekNumber === 0) continue;

    const ventaBruta = Number(row[4]) || 0;
    const descuento = Number(row[5]) || 0;
    if (ventaBruta === 0) continue;

    const margen = Math.round((descuento / ventaBruta) * 10_000) / 100;

    // TIENDA TOTAL row
    if (typeof col2 === "string" && col2.trim().toUpperCase() === "TIENDA TOTAL") {
      storeTotals.push({ weekNumber: currentWeekNumber, grossSales: ventaBruta, discountAmount: descuento, discountMargin: margen });
      continue;
    }

    // Employee row — ExcelJS returns numeric employee IDs as numbers
    if (typeof col2 === "number" && col2 > 0) {
      records.push({ employeeNumber: String(Math.trunc(col2)), weekNumber: currentWeekNumber, grossSales: ventaBruta, discountAmount: descuento, discountMargin: margen });
      continue;
    }

    // Fallback: numeric string
    if (typeof col2 === "string") {
      const numStr = col2.trim();
      if (/^\d+$/.test(numStr) && Number(numStr) > 0) {
        records.push({ employeeNumber: numStr, weekNumber: currentWeekNumber, grossSales: ventaBruta, discountAmount: descuento, discountMargin: margen });
      }
    }
  }

  const weekNumbers = Array.from(new Set([...records.map((r) => r.weekNumber), ...storeTotals.map((r) => r.weekNumber)])).sort((a, b) => a - b);
  const employeeNumbers = Array.from(new Set(records.map((r) => r.employeeNumber)));

  return { records, storeTotals, weekNumbers, employeeNumbers };
}
