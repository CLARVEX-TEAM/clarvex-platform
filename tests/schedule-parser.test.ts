import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "../lib/spreadsheet";
import { parseScheduleWorkbook } from "../lib/schedule-parser";

test("detecta bloques semanales repetidos y normaliza estados", () => {
  const rows = [
    ["SEMANA", "1"],
    ["# DE EMPLEADO", "NOMBRE", "DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "No. días laborados por persona"],
    [null, null, "03/05/2026", "04/05/2026", "05/05/2026", "06/05/2026", "07/05/2026", "08/05/2026", "09/05/2026"],
    [81893, "Nombre ignorado", "DESCANSO", "LABORANDO", "VACACIONES", "PAGO DIA", "CONTEO", "BAJA", "LABORANDO", 4],
    ["No. PERSONAS LABORANDO POR DÍA", null, 1, 1, 1, 1, 1, 1, 1],
    [],
    ["SEMANA 2"],
    ["# DE EMPLEADO", "NOMBRE", "DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"],
    [null, null, "10/05/2026", "11/05/2026", "12/05/2026", "13/05/2026", "14/05/2026", "15/05/2026", "16/05/2026"],
    ["102259", "Otro nombre", "LABORANDO", "CAPACITACION", "DESCANSO", null, null, null, null]
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "MAYO 26");

  const result = parseScheduleWorkbook(workbook);

  assert.equal(result.weeks.length, 2);
  assert.deepEqual(result.employeeNumbers, ["81893", "102259"]);
  assert.equal(result.records.length, 9);
  assert.deepEqual(result.records.slice(0, 6).map((record) => record.status), [
    "OFF", "WORKING", "VACATION", "PAID_DAY", "INVENTORY", "TERMINATED"
  ]);
  assert.equal(result.records[0].employeeNumber, "81893");
  assert.equal(result.records[0].date.toISOString(), "2026-05-03T00:00:00.000Z");
  assert.equal(result.unknownValues.CAPACITACION, 1);
  assert.equal(result.records.some((record) => record.employeeNumber.includes("PERSONAS")), false);
});

test("elimina duplicados por empleado y fecha conservando el ultimo valor", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["# DE EMPLEADO", "NOMBRE", "DOMINGO", "LUNES", "MARTES"],
    [null, null, "03/05/2026", "04/05/2026", "05/05/2026"],
    ["001", "Persona", "LABORANDO", null, null],
    ["# DE EMPLEADO", "NOMBRE", "DOMINGO", "LUNES", "MARTES"],
    [null, null, "03/05/2026", "04/05/2026", "05/05/2026"],
    ["001", "Persona", "DESCANSO", null, null]
  ]), "MAYO 26");

  const result = parseScheduleWorkbook(workbook);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].status, "OFF");
});

test("una celda con rango de horas es un turno LABORANDO con entrada y salida", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["# DE EMPLEADO", "NOMBRE", "DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES"],
    [null, null, "03/05/2026", "04/05/2026", "05/05/2026", "06/05/2026", "07/05/2026"],
    ["81893", "Apertura", "10:30-19:00", "12-9", "10:30 a 7", "LABORANDO", "DESCANSO"]
  ]), "MAYO 26");

  const result = parseScheduleWorkbook(workbook);
  const [r1, r2, r3, r4, r5] = result.records;
  // 10:30-19:00 explícito
  assert.equal(r1.status, "WORKING"); assert.equal(r1.startTime, "10:30"); assert.equal(r1.endTime, "19:00");
  // "12-9" → cierre PM 12:00-21:00
  assert.equal(r2.startTime, "12:00"); assert.equal(r2.endTime, "21:00");
  // "10:30 a 7" → 10:30-19:00
  assert.equal(r3.startTime, "10:30"); assert.equal(r3.endTime, "19:00");
  // LABORANDO sin hora sigue válido
  assert.equal(r4.status, "WORKING"); assert.equal(r4.startTime, null);
  // DESCANSO no trae horas
  assert.equal(r5.status, "OFF"); assert.equal(r5.startTime, null);
  assert.deepEqual(result.unknownValues, {});
});
