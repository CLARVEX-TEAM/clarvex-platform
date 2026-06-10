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

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function numericCell(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.()-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function findWeekNumber(row: unknown[]): number | null {
  for (const cell of row) {
    const match = normalizeText(cell).match(/SEMANA\s+(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
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

    const hasDiscountData = rows.some((row) => findWeekNumber(row) !== null);
    if (!hasDiscountData) continue;

    sheetsUsed.push(sheetName);
    let currentWeekNumber: number | null = null;
    let grossSalesCol = 2;
    let discountCol = 3;
    let marginCol = 4;

    for (const row of rows) {
      if (!row.some((cell) => cell !== null && cell !== "")) continue;

      const weekNum = findWeekNumber(row);
      if (weekNum !== null) {
        currentWeekNumber = weekNum;
        grossSalesCol = 2;
        discountCol = 3;
        marginCol = 4;
        continue;
      }

      if (currentWeekNumber === null) continue;

      const normalized = row.map(normalizeText);

      // Detect column positions from header row
      const vbIdx = normalized.findIndex((t) => t === "VENTA BRUTA" || t.startsWith("VENTA BRUTA"));
      if (vbIdx >= 0) {
        grossSalesCol = vbIdx;
        discountCol = vbIdx + 1;
        marginCol = vbIdx + 2;
        continue;
      }

      // Skip header-only rows (no numeric data in expected columns)
      if (normalized.some((t) => t === "# DE EMPLEADO" || t === "NOMBRE" || t === "DESCUENTO" || t.includes("MARGEN DESC"))) continue;

      const firstCell = String(row[0] ?? "").trim();
      const firstNorm = normalizeText(firstCell);

      // TIENDA TOTAL row
      if (firstNorm.includes("TIENDA")) {
        let gs = numericCell(row[grossSalesCol]);
        let da = numericCell(row[discountCol]);
        // If merged cell pushed data one column left
        if (gs === 0 && da === 0) {
          gs = numericCell(row[grossSalesCol - 1]);
          da = numericCell(row[discountCol - 1]);
        }
        const dm = gs > 0 ? Math.round((da / gs) * 10_000) / 100 : 0;
        storeRecords.push({ weekNumber: currentWeekNumber, grossSales: gs, discountAmount: da, discountMargin: dm });
        continue;
      }

      // Employee row: first cell is a 4-6 digit employee number
      if (/^\d{4,6}$/.test(firstCell)) {
        const gs = numericCell(row[grossSalesCol]);
        const da = numericCell(row[discountCol]);
        const dm = gs > 0 ? Math.round((da / gs) * 10_000) / 100 : 0;
        records.push({
          employeeNumber: firstCell,
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
