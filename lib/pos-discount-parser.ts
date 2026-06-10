import * as XLSX from "@/lib/spreadsheet";

export type DiscountWeekRecord = {
  employeeNumber: string;
  weekNumber: number;
  grossSales: number;
  discountAmount: number;
  discountMargin: number;
};

export type StoreWeekDiscount = {
  weekNumber: number;
  grossSales: number;
  discountAmount: number;
  discountMargin: number;
};

export type DiscountParseResult = {
  records: DiscountWeekRecord[];
  storeRecords: StoreWeekDiscount[];
  weekNumbers: number[];
  employeeNumbers: string[];
  sheetsUsed: string[];
};

// Col layout (0-indexed, after spreadsheet.ts .slice(1)):
//   row[1] — "SEMANA XX" header cell (Col B in Excel, row.values[2] in ExcelJS 1-based)
//   row[2] — employee number (stored as JS number by ExcelJS) | "TIENDA TOTAL" | empty (Col C)
//   row[3] — employee name (Col D)
//   row[4] — venta bruta / Col E (row.values[5] in ExcelJS)
//   row[5] — descuento / Col F (row.values[6] in ExcelJS)
//   row[6] — margin formula string — NOT read; margin calculated from row[4]/row[5]
// All rows are scanned (no header skip) because SEMANA blocks may appear at any row.

export function parsePosDiscountWorkbook(workbook: XLSX.WorkBook): DiscountParseResult {
  const records: DiscountWeekRecord[] = [];
  const storeRecords: StoreWeekDiscount[] = [];
  const sheetsUsed: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true
    }) as unknown[][];

    // Detect sheets that contain SEMANA XX blocks (col B = row[1])
    const hasDiscountData = rows.some((row) => row[1] != null && String(row[1]).trim().toUpperCase().startsWith("SEMANA"));
    if (!hasDiscountData) continue;

    sheetsUsed.push(sheetName);
    let currentWeekNumber: number | null = null;

    for (const row of rows) {
      // Col B (row[1]): detect "SEMANA XX" — use startsWith to handle formats like "SEMANA25", "SEMANA 25", "Semana 25"
      const col1Text = row[1] != null ? String(row[1]).trim() : "";
      if (col1Text.toUpperCase().startsWith("SEMANA")) {
        const numMatch = col1Text.match(/\d+/);
        if (numMatch) currentWeekNumber = parseInt(numMatch[0], 10);
        continue;
      }

      if (currentWeekNumber === null) continue;

      // Col E (row[4]): venta bruta — ExcelJS reads numeric cells as JS numbers
      const ventaBruta = Number(row[4]) || 0;
      if (ventaBruta === 0) continue;

      const descuento = Number(row[5]) || 0;
      const margen = Math.round((descuento / ventaBruta) * 10_000) / 100;

      // Col C (row[2]): employee number (JS number from ExcelJS) or "TIENDA TOTAL" string
      const col2 = row[2];

      // TIENDA TOTAL row
      if (typeof col2 === "string" && col2.trim().toUpperCase() === "TIENDA TOTAL") {
        storeRecords.push({ weekNumber: currentWeekNumber, grossSales: ventaBruta, discountAmount: descuento, discountMargin: margen });
        continue;
      }

      // Employee row: ExcelJS stores numeric cells as JS numbers
      if (typeof col2 === "number" && col2 > 0) {
        records.push({
          employeeNumber: String(Math.trunc(col2)),
          weekNumber: currentWeekNumber,
          grossSales: ventaBruta,
          discountAmount: descuento,
          discountMargin: margen
        });
        continue;
      }

      // Fallback: employee number stored as a numeric string
      if (typeof col2 === "string") {
        const numStr = col2.trim();
        if (/^\d+$/.test(numStr) && Number(numStr) > 0) {
          records.push({
            employeeNumber: numStr,
            weekNumber: currentWeekNumber,
            grossSales: ventaBruta,
            discountAmount: descuento,
            discountMargin: margen
          });
        }
      }
    }
  }

  return {
    records,
    storeRecords,
    weekNumbers: Array.from(new Set(records.map((r) => r.weekNumber).concat(storeRecords.map((r) => r.weekNumber)))),
    employeeNumbers: Array.from(new Set(records.map((r) => r.employeeNumber))),
    sheetsUsed
  };
}
