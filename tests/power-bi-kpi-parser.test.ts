import assert from "node:assert/strict";
import test from "node:test";
import { parsePowerBiKpiWorkbook } from "../lib/integrations/power-bi-kpi-parser";
import { resolveRetailCalendarFilter } from "../lib/integrations/power-bi-calendar";
import * as XLSX from "../lib/spreadsheet";

function buildWorkbook(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Export");
  return workbook;
}

test("parsePowerBiKpiWorkbook lee columnas del export de Power BI", () => {
  const workbook = buildWorkbook([
    ["EMPLOYEE", "SALES", "TRANSACTION", "% CONV EMP", "AUR", "EPT", "UPT", "QUANTITY"],
    ["95739", 12500.5, 18, 12.5, 694.47, 694.47, 1.2, 22],
    ["TOMMY SAN AGUSTIN", 9800, 14, 9.8, 700, 700, 1.1, 14]
  ]);

  const parsed = parsePowerBiKpiWorkbook(workbook);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].employeeNumber, "95739");
  assert.equal(parsed.rows[0].dailySales, 12500.5);
  assert.equal(parsed.rows[0].transactions, 18);
  assert.equal(parsed.rows[0].pieces, 22);
  assert.equal(parsed.rows[0].conversion, 12.5);
  assert.equal(parsed.rows[1].employeeLabel, "TOMMY SAN AGUSTIN");
});

test("resolveRetailCalendarFilter usa hoy retail cuando no hay fecha", () => {
  const filter = resolveRetailCalendarFilter(undefined, new Date("2026-07-12T15:00:00.000Z"));
  assert.equal(filter.year, 2026);
  assert.equal(filter.month, 7);
  assert.equal(filter.day, 12);
});
