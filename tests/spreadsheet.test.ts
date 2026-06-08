import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { read, utils } from "../lib/spreadsheet";

test("lee un archivo xlsx real usando exceljs", async () => {
  const source = new ExcelJS.Workbook();
  source.addWorksheet("Datos").addRows([["Empleado", "Meta"], ["95739", 11313]]);
  const buffer = await source.xlsx.writeBuffer();
  const bytes = buffer as unknown as Uint8Array;
  const workbook = await read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const rows = utils.sheet_to_json(workbook.Sheets.Datos, { header: 1, raw: true });

  assert.deepEqual(workbook.SheetNames, ["Datos"]);
  assert.deepEqual(rows, [["Empleado", "Meta"], ["95739", 11313]]);
});
