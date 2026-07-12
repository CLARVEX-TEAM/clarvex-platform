import * as XLSX from "@/lib/spreadsheet";

export type PowerBiKpiRow = {
  employeeKey: string;
  employeeLabel: string;
  employeeNumber: string;
  dailySales: number;
  transactions: number;
  pieces: number;
  upt: number;
  ept: number;
  conversion: number | null;
};

export type ParsedPowerBiKpiWorkbook = {
  sheetUsed: string;
  rows: PowerBiKpiRow[];
  employeeKeys: string[];
  rowsRead: number;
  ignoredRows: number;
};

const COLUMN_ALIASES: Record<string, keyof Omit<PowerBiKpiRow, "employeeKey" | "employeeLabel" | "employeeNumber">> = {
  SALES: "dailySales",
  TRANSACTION: "transactions",
  TRANSACTIONS: "transactions",
  QUANTITY: "pieces",
  UPT: "upt",
  EPT: "ept",
  AUR: "aur" as never,
  EMPLOYEE: "employeeLabel" as never,
  "% CONV EMP": "conversion",
  "CONV EMP": "conversion",
  "% CONV": "conversion",
  CONVERSION: "conversion"
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[´']/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseConversion(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = parseNumber(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  return numeric <= 1 ? numeric * 100 : numeric;
}

export function employeeNumberFromCell(value: unknown): string {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? String(Math.trunc(value))
    : String(value ?? "").trim().replace(/\.0+$/, "").replace(/\s+/g, "");
  return /^\d+$/.test(normalized) ? normalized : "";
}

function findHeaderRow(rows: unknown[][]): { index: number; columns: Map<keyof PowerBiKpiRow | "employee", number> } | null {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;
    const columns = new Map<keyof PowerBiKpiRow | "employee", number>();
    row.forEach((cell, columnIndex) => {
      const header = normalizeHeader(cell);
      if (header === "EMPLOYEE") {
        columns.set("employee", columnIndex);
        return;
      }
      const mapped = COLUMN_ALIASES[header];
      if (mapped && mapped !== ("aur" as never) && mapped !== ("employeeLabel" as never)) {
        columns.set(mapped, columnIndex);
      }
    });
    if (columns.has("employee") && columns.has("dailySales")) {
      return { index, columns };
    }
  }
  return null;
}

function rowHasData(row: unknown[], employeeColumn: number): boolean {
  const employee = String(row[employeeColumn] ?? "").trim();
  return employee.length > 0 && !normalizeHeader(employee).includes("TOTAL");
}

export function parsePowerBiKpiWorkbook(workbook: XLSX.WorkBook): ParsedPowerBiKpiWorkbook {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true
    }) as unknown[][];
    const header = findHeaderRow(rows);
    if (!header) continue;

    const employeeColumn = header.columns.get("employee");
    if (employeeColumn === undefined) continue;

    const parsedRows: PowerBiKpiRow[] = [];
    let ignoredRows = 0;

    for (let rowIndex = header.index + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!Array.isArray(row) || !rowHasData(row, employeeColumn)) {
        ignoredRows += 1;
        continue;
      }

      const employeeLabel = String(row[employeeColumn] ?? "").trim();
      const employeeNumber = employeeNumberFromCell(row[employeeColumn]);
      const employeeKey = employeeNumber || employeeLabel;
      if (!employeeKey) {
        ignoredRows += 1;
        continue;
      }

      const conversionColumn = header.columns.get("conversion");
      parsedRows.push({
        employeeKey,
        employeeLabel,
        employeeNumber,
        dailySales: parseNumber(row[header.columns.get("dailySales") ?? -1]),
        transactions: parseNumber(row[header.columns.get("transactions") ?? -1]),
        pieces: parseNumber(row[header.columns.get("pieces") ?? -1]),
        upt: parseNumber(row[header.columns.get("upt") ?? -1]),
        ept: parseNumber(row[header.columns.get("ept") ?? -1]),
        conversion: conversionColumn === undefined ? null : parseConversion(row[conversionColumn])
      });
    }

    if (parsedRows.length === 0) continue;

    const employeeKeys = Array.from(new Set(parsedRows.map((row) => row.employeeKey)));
    return {
      sheetUsed: sheetName,
      rows: parsedRows,
      employeeKeys,
      rowsRead: rows.length,
      ignoredRows
    };
  }

  throw new Error(
    `No se encontró una hoja con columnas SALES y EMPLOYEE. Hojas disponibles: ${workbook.SheetNames.join(", ")}`
  );
}
