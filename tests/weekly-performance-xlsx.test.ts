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
  { userId: "g", name: "Gerente", role: "GERENTE" as const },
  { userId: "s", name: "Subgerente", role: "SUBGERENTE" as const },
  { userId: "a1", name: "Asesor Uno", role: "ASESOR" as const },
  { userId: "a2", name: "Asesor Dos", role: "ASESOR" as const }
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

const columns = people.map((person) => column(person, quota.personTotals[person.userId].goal));
const storeColumn = column({ userId: "store", name: "Tienda", role: "GERENTE" }, quota.storeTotal);
storeColumn.sales = 4_000;

const state: WeeklyPerformanceState = {
  store: { id: "store-1", name: "TH SAN AGUSTIN" },
  reportWeek: { weekNumber: 33, weekStart: reportDates[0], weekEnd: reportDates[6], dates: reportDates },
  quotaWeek: { weekNumber: 34, weekStart: dates[0], weekEnd: dates[6], dates },
  status: "DRAFT", recordId: "close-1", finalizedAt: null, finalizedBy: null,
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
  assert.equal(workbook.getWorksheet("CJ")!.getCell("C14").value, "Gerente");
  assert.equal(workbook.getWorksheet("CJ")!.getCell("D14").value, 0.1);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("D8").value, 1_000);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("M2").value, 33);
  assert.equal(workbook.getWorksheet("RDS")!.getCell("M8").value, null);
  assert.equal(workbook.getWorksheet("HORARIOS")!.state, "hidden");
  assert.equal(workbook.getWorksheet("RDS")!.pageSetup.orientation, "landscape");

  const zip = await JSZip.loadAsync(buffer);
  const xmlParts = await Promise.all(Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")));
  assert.equal(xmlParts.some((xml) => xml.includes("#REF!")), false);
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(workbookXml, /calcMode="auto"/);
  assert.match(workbookXml, /fullCalcOnLoad="1"/);
  assert.equal(Boolean(zip.file("xl/calcChain.xml")), false);
});
