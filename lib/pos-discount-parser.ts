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

// Col layout (0-indexed):
//   0: always empty
//   1: "SEMANA XX" header, or empty
//   2: employee number (int) | "TIENDA TOTAL" | empty
//   3: employee name | empty
//   4: venta bruta (number)
//   5: descuento (number)
//   6: formula string — NOT read; margin is calculated from cols 4 and 5
// Data starts at row index 5 (row 6 in Excel).

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function numericCell(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.()-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

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

    // Rows 0-4 are title/header area; data starts at index 5
    const dataRows = rows.slice(5);

    const hasDiscountData = dataRows.some((row) => /SEMANA\s+\d+/i.test(String(row[1] ?? "")));
    if (!hasDiscountData) continue;

    sheetsUsed.push(sheetName);
    let currentWeekNumber: number | null = null;

    for (const row of dataRows) {
      // Col 1: detect "SEMANA XX"
      const semanaMatch = String(row[1] ?? "").trim().match(/SEMANA\s+(\d+)/i);
      if (semanaMatch) {
        currentWeekNumber = parseInt(semanaMatch[1], 10);
        continue;
      }

      if (currentWeekNumber === null) continue;

      // Col 4: venta bruta — skip rows with no sales data (headers, blank lines, weeks with no data)
      const gs = numericCell(row[4]);
      if (gs === 0) continue;

      const da = numericCell(row[5]);
      const dm = Math.round((da / gs) * 10_000) / 100;
      const col2 = normalizeText(row[2]);

      // TIENDA TOTAL row
      if (col2.includes("TIENDA")) {
        storeRecords.push({ weekNumber: currentWeekNumber, grossSales: gs, discountAmount: da, discountMargin: dm });
        continue;
      }

      // Employee row: col[2] is a numeric employee number (may be stored as number or string)
      const empNum = Number(String(row[2] ?? "").trim());
      if (!isNaN(empNum) && empNum > 0) {
        records.push({
          employeeNumber: String(empNum),
          weekNumber: currentWeekNumber,
          grossSales: gs,
          discountAmount: da,
          discountMargin: dm
        });
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
