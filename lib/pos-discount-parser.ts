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
    // After detecting SEMANA row (consumed via continue), skip the next 1 header row
    // (the "VENTA BRUTA | DESCUENTO | MARGEN DESC %" row) before reading data.
    let headerRowsRemaining = 0;

    for (const row of rows) {
      // New week block: row starts with "SEMANA XX" (also has # DE EMPLEADO, NOMBRE)
      const weekNum = findWeekNumber(row);
      if (weekNum !== null) {
        currentWeekNumber = weekNum;
        headerRowsRemaining = 1;
        continue;
      }

      if (currentWeekNumber === null) continue;

      // Skip empty rows without decrementing the header counter
      if (!row.some((cell) => cell !== null && cell !== "")) continue;

      // Skip the VENTA BRUTA / DESCUENTO / MARGEN DESC % header row
      if (headerRowsRemaining > 0) {
        headerRowsRemaining -= 1;
        continue;
      }

      const firstCell = String(row[0] ?? "").trim();
      const firstNorm = normalizeText(firstCell);

      // TIENDA TOTAL: col[0]="TIENDA TOTAL", col[1]=grossSales, col[2]=discount
      if (firstNorm.includes("TIENDA")) {
        const gs = numericCell(row[1]);
        const da = numericCell(row[2]);
        const dm = gs > 0 ? Math.round((da / gs) * 10_000) / 100 : 0;
        storeRecords.push({ weekNumber: currentWeekNumber, grossSales: gs, discountAmount: da, discountMargin: dm });
        continue;
      }

      // Employee row: col[0]=employeeNumber, col[2]=grossSales, col[3]=discount
      // Use !isNaN to identify numeric employee numbers (may come as number or string)
      const firstNum = Number(firstCell);
      if (!isNaN(firstNum) && firstNum > 0) {
        const gs = numericCell(row[2]);
        const da = numericCell(row[3]);
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
