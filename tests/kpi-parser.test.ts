import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseKpiWorkbook } from "../lib/kpi-parser";

const metrics = [
  "Meta diaria",
  "VTAS Ttls SIN IVA",
  "TX Ttls",
  "Unid Ttls",
  "TX cap CRM",
  "Dev SIN IVA",
  "ORKESTRA VTAS SIN IVA",
  "ORKESTRA TX",
  "ORKESTRA Unid",
  "Open Pay VTAS SIN IVA",
  "Pay Pal VTAS SIN IVA"
];

test("parsea Diario de ventas por employeeNumber y calcula KPIs", () => {
  const rows: unknown[][] = Array.from({ length: 9 }, () => []);
  rows[5] = [null, null, "ASESOR", ...Array(10), "SUBGERENTE"];
  rows[6] = [null, null, "95739", ...Array(10), "102259"];
  rows[7] = [null, null, "Nombre no usado", ...Array(10), "Otro nombre"];
  rows[8] = ["DIA", "FECHA", ...metrics, ...metrics];
  rows.push(["SEMANA 22"]);
  rows.push([
    "LUNES", "01/06/2026",
    10000, 12500, 5, 10, 3, 0, 0, 0, 0, 0, 0,
    20000, 10000, 4, 8, 2, 0, 0, 0, 0, 0, 0
  ]);
  rows.push(["TTLS", null, ...Array(22).fill(999)]);
  rows.push(["BONOS"]);
  rows.push(["INCIDENCIAS"]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Diario de ventas");

  const result = parseKpiWorkbook(workbook);

  assert.deepEqual(result.employeeNumbers, ["95739", "102259"]);
  assert.equal(result.records.length, 2);
  assert.equal(result.rowsRead, 5);
  assert.equal(result.ignoredRows, 3);
  assert.deepEqual(result.records[0], {
    employeeNumber: "95739",
    employeeName: "Nombre no usado",
    role: "ASESOR",
    date: new Date("2026-06-01T00:00:00.000Z"),
    weekNumber: 22,
    weekStart: new Date("2026-06-01T00:00:00.000Z"),
    weekEnd: new Date("2026-06-07T00:00:00.000Z"),
    dailyGoal: 10000,
    dailySales: 12500,
    transactions: 5,
    pieces: 10,
    crmTransactions: 3,
    upt: 2,
    aur: 1250,
    ept: 2500,
    achievement: 125
  });
  assert.equal(result.crmTransactionsTotal, 5);
});

test("respeta una semana RDV que inicia en domingo", () => {
  const rows: unknown[][] = Array.from({ length: 9 }, () => []);
  rows[5] = [null, null, "ASESOR"];
  rows[6] = [null, null, "95739"];
  rows[7] = [null, null, "Asesor"];
  rows[8] = ["DIA", "FECHA", ...metrics];
  rows.push(["SEMANA 22"]);
  rows.push(["DOMINGO", "31/05/2026", 100, 200, 1, 2, 0]);
  rows.push(["LUNES", "01/06/2026", 100, 300, 1, 2, 0]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Diario de ventas");
  const result = parseKpiWorkbook(workbook);

  assert.equal(result.records[0].weekNumber, 22);
  assert.equal(result.records[0].weekStart.toISOString(), "2026-05-31T00:00:00.000Z");
  assert.equal(result.records[0].weekEnd.toISOString(), "2026-06-06T00:00:00.000Z");
  assert.equal(result.records[1].weekStart.toISOString(), "2026-05-31T00:00:00.000Z");
});

test("ignora filas vacias y exige la hoja Diario de ventas", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["sin datos"]]), "Resumen");
  assert.throws(() => parseKpiWorkbook(workbook), /Diario de ventas/);
});

test("reconstruye semana por fecha cuando el RDV legacy no trae marcador", () => {
  const rows: unknown[][] = Array.from({ length: 9 }, () => []);
  rows[5] = [null, null, "ASESOR"];
  rows[6] = [null, null, "95739"];
  rows[7] = [null, null, "Asesor"];
  rows[8] = ["DIA", "FECHA", ...metrics];
  rows.push(["MIERCOLES", "03/06/2026", 100, 200, 1, 2, 0]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Diario de ventas");
  const result = parseKpiWorkbook(workbook);

  assert.equal(result.records[0].weekNumber, 22);
  assert.equal(result.records[0].weekStart.toISOString(), "2026-05-31T00:00:00.000Z");
  assert.equal(result.records[0].weekEnd.toISOString(), "2026-06-06T00:00:00.000Z");
});
