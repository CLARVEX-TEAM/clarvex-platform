import ExcelJS from "exceljs";

export type WorkSheet = unknown[][];
export type WorkBook = {
  SheetNames: string[];
  Sheets: Record<string, WorkSheet>;
};

export async function read(buffer: ArrayBuffer): Promise<WorkBook> {
  const excel = new ExcelJS.Workbook();
  const input = Buffer.from(new Uint8Array(buffer)) as unknown as Parameters<typeof excel.xlsx.load>[0];
  await excel.xlsx.load(input);
  const workbook = book_new();

  excel.eachSheet((worksheet) => {
    const rows: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = Array.isArray(row.values) ? row.values.slice(1).map(cellValue) : [];
      rows[rowNumber - 1] = values;
    });
    book_append_sheet(workbook, rows, worksheet.name);
  });

  return workbook;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object") {
    if ("result" in value) return value.result ?? null;
    if ("text" in value) return value.text;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return value ?? null;
}

function book_new(): WorkBook {
  return { SheetNames: [], Sheets: {} };
}

function aoa_to_sheet(rows: unknown[][]): WorkSheet {
  return rows.map((row) => [...row]);
}

function book_append_sheet(workbook: WorkBook, sheet: WorkSheet, name: string) {
  if (!workbook.SheetNames.includes(name)) workbook.SheetNames.push(name);
  workbook.Sheets[name] = sheet;
}

function sheet_to_json(sheet: WorkSheet, options?: { header?: number; blankrows?: boolean; defval?: unknown; raw?: boolean }): unknown[][] {
  const defval = options?.defval ?? null;
  const rows = sheet.map((row) => row.map((value) => value === undefined ? defval : value));
  return options?.blankrows === false
    ? rows.filter((row) => row.some((value) => value !== null && value !== ""))
    : rows;
}

function parse_date_code(serial: number) {
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export const utils = { book_new, aoa_to_sheet, book_append_sheet, sheet_to_json };
export const SSF = { parse_date_code };
