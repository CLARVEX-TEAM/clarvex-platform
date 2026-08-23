import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { calculateFairQuota } from "../lib/fair-quota";
import type { WeeklyCloseColumn } from "../lib/weekly-close";
import type { WeeklyPerformanceState } from "../lib/weekly-performance";
import { buildWeeklyPerformanceWorkbook } from "../lib/weekly-performance-xlsx";

const people = [
  { userId: "g", name: "ITZEL SAIDY REYES BAUTISTA", role: "GERENTE" as const },
  { userId: "s", name: "JESUS ADRIAN HERNANDEZ LUNA", role: "SUBGERENTE" as const },
  { userId: "a1", name: "ALONSO TREVIÑO", role: "ASESOR" as const },
  { userId: "a2", name: "JAZMÍN CASTRO ZUÑIGA", role: "ASESOR" as const },
  { userId: "a3", name: "WAIRA ZITLALI POPOCA", role: "ASESOR" as const }
];
const dates = ["2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"];
const reportDates = ["2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"];
const presence = Object.fromEntries(dates.map((date) => [date, people.map((person) => person.userId)]));
const minimums = Object.fromEntries(dates.map((date, index) => [date, 10_000 + index * 1_000]));
const quota = calculateFairQuota({ dates, people, presence, minimums, whatsappBudget: 700 });

function column(person: typeof people[number], goal: number): WeeklyCloseColumn {
  return {
    userId: person.userId, name: person.name, role: person.role, goal, sales: 1_000, difference: 1_000 - goal,
    achievement: goal ? 100_000 / goal : 0, transactions: 2, pieces: 3, traffic: 20,
    ept: 500, upt: 1.5, aur: 333.33, tc: 10, lossEpt: 0, lossUpt: 0, lossAur: 0,
    focus: "FELICIDADES", waMeta: 100, waSales: 90, waTransactions: 1, waPieces: 1
  };
}

// Las metas historicas del RDS son deliberadamente distintas de la CJ siguiente.
// Asi una formula residual CJ!T14 no puede pasar la prueba por coincidencia.
const columns = people.map((person, index) => column(person, 2_000 + index * 500));
const storeColumn = column({ userId: "store", name: "Tienda", role: "GERENTE" }, quota.storeTotal);
storeColumn.sales = 4_000;

const state: WeeklyPerformanceState = {
  store: { id: "store-1", name: "TH SAN AGUSTIN" },
  reportWeek: { weekNumber: 33, weekStart: reportDates[0], weekEnd: reportDates[6], dates: reportDates },
  quotaWeek: { weekNumber: 34, weekStart: dates[0], weekEnd: dates[6], dates },
  status: "DRAFT", recordId: "close-1",
  quotaSavedAt: "2026-08-22T18:00:00.000Z", quotaSavedBy: "Gerencia",
  reportSavedAt: null, reportSavedBy: null, reportDirty: false,
  finalizedAt: null, finalizedBy: null,
  plan: { minimums, upliftPercent: 15, whatsappBudget: 700 }, quota,
  schedules: Object.fromEntries(people.map((person) => [person.userId, Object.fromEntries(dates.map((date) => [date, "WORKING"]))])),
  report: { columns, store: storeColumn, whatsappBudget: 700 }, history: []
};

test("rellena CJ y RDS conservando el libro original y sin resultados viejos", async () => {
  const buffer = await buildWeeklyPerformanceWorkbook(state);
  if (process.env.XLSX_VERIFY_OUTPUT) await fs.writeFile(process.env.XLSX_VERIFY_OUTPUT, buffer);
  const diagnosticZip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(diagnosticZip.files).filter((part) => /^xl\/worksheets\/sheet\d+\.xml$/.test(part))) {
    const xml = await diagnosticZip.file(name)!.async("string");
    assert.equal((xml.match(/<\?xml/g) ?? []).length, 1, `${name} contiene más de una declaración XML`);
    assert.equal((xml.match(/<worksheet[\s>]/g) ?? []).length, 1, `${name} contiene más de una raíz worksheet`);
    assert.equal(xml.slice(xml.indexOf("</worksheet>") + "</worksheet>".length).trim(), "", `${name} contiene datos fuera de la raíz`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["INSTRUCCIONES", "CJ", "RDS", "Consulta1", "HORARIOS"]);
  assert.equal(workbook.getWorksheet("CJ")!.getCell("J2").value, "TH SAN AGUSTIN");
  assert.equal(workbook.getWorksheet("CJ")!.getCell("T2").value, 34);
  assert.equal((workbook.getWorksheet("CJ")!.getCell("D6").value as Date).toISOString().slice(0, 10), "2026-08-23");
  assert.equal(workbook.getWorksheet("CJ")!.getCell("D8").value, 10_000);
  assert.deepEqual(
    ["C14", "C15", "C16", "C17", "C18"].map((cell) => workbook.getWorksheet("CJ")!.getCell(cell).value),
    ["Itzel", "Adrian", "Alonso", "Jazmín", "Waira"]
  );
  assert.deepEqual(
    ["C29", "C30", "C31", "C32", "C33"].map((cell) => formulaResult(workbook.getWorksheet("CJ")!.getCell(cell).value)),
    ["Itzel", "Adrian", "Alonso", "Jazmín", "Waira"]
  );
  assert.equal(workbook.getWorksheet("CJ")!.getCell("D14").value, 0.1);
  assert.deepEqual(
    ["D6", "E6", "F6", "G6", "H6"].map((cell) => formulaResult(workbook.getWorksheet("RDS")!.getCell(cell).value)),
    ["Itzel", "Adrian", "Alonso", "Jazmín", "Waira"]
  );
  assert.equal(workbook.getWorksheet("RDS")!.getCell("D8").value, 1_000);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("D7").value, 2_000);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("D25").value, 100);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("H2").value, "TH SAN AGUSTIN");
  assert.equal(workbook.getWorksheet("RDS")!.getCell("M2").value, 33);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("M8").value, null);
  assert.equal(workbook.getWorksheet("HORARIOS")!.state, "hidden");
  assert.equal(workbook.getWorksheet("RDS")!.pageSetup.orientation, "landscape");

  const zip = await JSZip.loadAsync(buffer);
  const xmlParts = await Promise.all(Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")));
  assert.equal(xmlParts.some((xml) => xml.includes("#REF!")), false);
  assert.doesNotMatch(await zip.file("xl/worksheets/sheet2.xml")!.async("string"), /<f[^>]*t="shared"/);
  assert.doesNotMatch(await zip.file("xl/worksheets/sheet3.xml")!.async("string"), /<f[^>]*t="shared"/);
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(workbookXml, /calcMode="auto"/);
  assert.match(workbookXml, /fullCalcOnLoad="1"/);
  assert.equal(Boolean(zip.file("xl/calcChain.xml")), false);
  assert.equal(Boolean(zip.file("xl/metadata.xml")), false);
  assert.doesNotMatch(await zip.file("[Content_Types].xml")!.async("string"), /(?:calcChain|metadata)\.xml/);
  assert.doesNotMatch(await zip.file("xl\/_rels\/workbook.xml.rels")!.async("string"), /(?:calcChain|metadata)\.xml/);
});

function formulaResult(value: unknown) {
  return value && typeof value === "object" && "result" in value ? value.result : value;
}

test("exporta Cuota Justa y RDS como archivos independientes sin eliminar hojas", async () => {
  const quotaBuffer = await buildWeeklyPerformanceWorkbook(state, "quota");
  if (process.env.XLSX_VERIFY_QUOTA_OUTPUT) await fs.writeFile(process.env.XLSX_VERIFY_QUOTA_OUTPUT, quotaBuffer);
  const quotaBook = new ExcelJS.Workbook();
  await quotaBook.xlsx.load(quotaBuffer as unknown as ArrayBuffer);
  assert.equal(quotaBook.getWorksheet("CJ")!.state, "visible");
  assert.equal(quotaBook.getWorksheet("RDS")!.state, "hidden");
  assert.deepEqual(quotaBook.worksheets.map((sheet) => sheet.name), ["INSTRUCCIONES", "CJ", "RDS", "Consulta1", "HORARIOS"]);
  const quotaZip = await JSZip.loadAsync(quotaBuffer);
  const quotaWorkbookXml = await quotaZip.file("xl/workbook.xml")!.async("string");
  assert.match(quotaWorkbookXml, /activeTab="1"/);
  assert.match(await quotaZip.file("xl/worksheets/sheet2.xml")!.async("string"), /tabSelected="1"/);
  assert.doesNotMatch(await quotaZip.file("xl/worksheets/sheet3.xml")!.async("string"), /tabSelected="1"/);

  const rdsBuffer = await buildWeeklyPerformanceWorkbook(state, "rds");
  if (process.env.XLSX_VERIFY_RDS_OUTPUT) await fs.writeFile(process.env.XLSX_VERIFY_RDS_OUTPUT, rdsBuffer);
  const rdsBook = new ExcelJS.Workbook();
  await rdsBook.xlsx.load(rdsBuffer as unknown as ArrayBuffer);
  assert.equal(rdsBook.getWorksheet("CJ")!.state, "hidden");
  assert.equal(rdsBook.getWorksheet("RDS")!.state, "visible");
  assert.deepEqual(rdsBook.worksheets.map((sheet) => sheet.name), ["INSTRUCCIONES", "CJ", "RDS", "Consulta1", "HORARIOS"]);
  const rdsZip = await JSZip.loadAsync(rdsBuffer);
  const rdsWorkbookXml = await rdsZip.file("xl/workbook.xml")!.async("string");
  assert.match(rdsWorkbookXml, /activeTab="2"/);
  assert.doesNotMatch(await rdsZip.file("xl/worksheets/sheet2.xml")!.async("string"), /tabSelected="1"/);
  assert.match(await rdsZip.file("xl/worksheets/sheet3.xml")!.async("string"), /tabSelected="1"/);
});
