import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "../lib/spreadsheet";
import { parseAttendanceWorkbook } from "../lib/attendance-parser";

/** Las horas de Excel viajan como Date con fecha base 1899-12-30 y hora en UTC. */
function excelTime(hours: number, minutes: number) {
  return new Date(Date.UTC(1899, 11, 30, hours, minutes));
}

function buildWorkbook(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "APERTURA");
  return workbook;
}

// Réplica de la hoja real (índices en base 0: B=1, C=2, D=3, E=4, G=6, M=12).
const SHEET: unknown[][] = [
  [], // fila 1
  ["PUESTO", "NUMERO DE EMPLEDO", "NOMBRE COMPLETO", "Jornada Laboral"], // fila 2
  [null, null, null, "ENTRADA", "COMIDA", "COMIDA", "SALIDA", null, null, null, null, null, new Date(Date.UTC(2026, 6, 13))], // fila 3 → M3 = fecha
  ["PUESTO", "NUMERO DE EMPLEDO", "NOMBRE COMPLETO", "ENTRADA", "DE", "A:", "SALIDA"], // fila 4
  ["GERENTE", 81893, "Itzel Saidy Reyes Bautista", excelTime(10, 37), excelTime(13, 0), null, excelTime(21, 0)],
  ["SUBGERENTE", 102259, "Jesus Adrian Hernandez Luna"], // fila vacía: descansaba
  ["VENDEDOR 1", 95739, "Waira Zitlali Popoca Alvarez", "VACACIONES"],
  ["VENDEDOR 2", 96383, "Jazmín Castro Zúñiga", excelTime(10, 45), excelTime(14, 30), null, excelTime(21, 0)],
  ["VENDEDOR 3", 113642, "Eduardo Alonso Treviño Vazquez", "FALTA"]
];

test("lee la fecha que declara la hoja (celda M3)", () => {
  const parsed = parseAttendanceWorkbook(buildWorkbook(SHEET));
  assert.equal(parsed.sheetDate, "2026-07-13");
});

test("lee número de empleado, nombre, entrada, comida y salida", () => {
  const parsed = parseAttendanceWorkbook(buildWorkbook(SHEET));
  assert.equal(parsed.rows.length, 5);

  const itzel = parsed.rows[0];
  assert.equal(itzel.employeeNumber, "81893");
  assert.equal(itzel.name, "Itzel Saidy Reyes Bautista");
  assert.equal(itzel.arrived, "10:37");
  assert.equal(itzel.lunchStart, "13:00");
  assert.equal(itzel.leftAt, "21:00");
  assert.equal(itzel.entryText, null);
});

test("una fila vacía NO se interpreta: se deja en null para cruzarla con el horario", () => {
  // Es el caso de quien descansa. Si el parser decidiera aquí, marcaría falta.
  const parsed = parseAttendanceWorkbook(buildWorkbook(SHEET));
  const adrian = parsed.rows.find((row) => row.employeeNumber === "102259");
  assert.ok(adrian);
  assert.equal(adrian!.arrived, null);
  assert.equal(adrian!.entryText, null);
});

test("distingue una hora de un texto en la celda de entrada", () => {
  const parsed = parseAttendanceWorkbook(buildWorkbook(SHEET));
  const waira = parsed.rows.find((row) => row.employeeNumber === "95739");
  const alonso = parsed.rows.find((row) => row.employeeNumber === "113642");
  assert.equal(waira!.entryText, "VACACIONES");
  assert.equal(waira!.arrived, null);
  assert.equal(alonso!.entryText, "FALTA");
});

test("las horas se leen en UTC (no se corren con la zona del servidor)", () => {
  const parsed = parseAttendanceWorkbook(buildWorkbook(SHEET));
  const jazmin = parsed.rows.find((row) => row.employeeNumber === "96383");
  // 10:45 debe seguir siendo 10:45: si se leyera en hora local, se correría y
  // un retardo se convertiría en llegada a tiempo (o al revés).
  assert.equal(jazmin!.arrived, "10:45");
});

test("reporta los textos que no reconoce (para no tragárselos en silencio)", () => {
  const rows = structuredClone(SHEET);
  rows[8] = ["VENDEDOR 3", 113642, "Eduardo Alonso Treviño Vazquez", "SUSPENSIÓN"];
  const parsed = parseAttendanceWorkbook(buildWorkbook(rows));
  assert.deepEqual(parsed.unknownEntries, { "SUSPENSIÓN": 1 });
});

test("falla claro si el archivo no trae la hoja APERTURA", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), "OTRA");
  assert.throws(() => parseAttendanceWorkbook(workbook), /APERTURA/);
});
