import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { calculateFairQuota } from "../lib/fair-quota";
import type { WeeklyCloseColumn } from "../lib/weekly-close";
import type { WeeklyPerformanceState } from "../lib/weekly-performance";
import { buildWeeklyPerformancePdf, rdsAchievementMarker } from "../lib/weekly-performance-pdf";

const people = [
  { userId: "g", name: "ITZEL SAIDY REYES BAUTISTA", role: "GERENTE" as const },
  { userId: "s", name: "JESUS ADRIAN HERNANDEZ LUNA", role: "SUBGERENTE" as const },
  { userId: "a1", name: "ALONSO TREVIÑO", role: "ASESOR" as const },
  { userId: "a2", name: "JAZMÍN CASTRO ZUÑIGA", role: "ASESOR" as const },
  { userId: "a3", name: "WAIRA ZITLALI POPOCA", role: "ASESOR" as const }
];
const quotaDates = ["2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29"];
const reportDates = ["2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"];
const minimums = Object.fromEntries(quotaDates.map((date, index) => [date, 5_000 + index * 1_500]));
const quota = calculateFairQuota({
  dates: quotaDates,
  people,
  presence: Object.fromEntries(quotaDates.map((date) => [date, people.map((person) => person.userId)])),
  minimums,
  whatsappBudget: 1_381.06
});

function reportColumn(person: typeof people[number], index: number): WeeklyCloseColumn {
  const sales = 20_000 + index * 4_500;
  const goal = 18_000 + index * 3_000;
  return {
    userId: person.userId, name: person.name, role: person.role, goal, sales,
    difference: sales - goal, achievement: sales / goal * 100,
    transactions: 10 + index, pieces: 20 + index * 2, traffic: 700 + index * 50,
    ept: sales / (10 + index), upt: (20 + index * 2) / (10 + index), aur: sales / (20 + index * 2), tc: 1.5 + index * 0.2,
    lossEpt: index % 2 ? -2_500 : 1_100, lossUpt: index % 2 ? -1_100 : 900, lossAur: index % 2 ? -700 : 500,
    focus: index % 2 ? "UPT" : "FELICIDADES",
    waMeta: 197.29, waSales: 150 + index * 20, waTransactions: 1 + index, waPieces: 2 + index
  };
}

const columns = people.map(reportColumn);
const pointOfSaleAchievements = [75, 90, 100, 120, 110];
columns.forEach((column, index) => { column.achievement = pointOfSaleAchievements[index]; });
const store: WeeklyCloseColumn = {
  ...reportColumn({ userId: "store", name: "Tienda", role: "GERENTE" }, 0),
  userId: "store", name: "Tienda", goal: sum(columns.map((item) => item.goal)), sales: sum(columns.map((item) => item.sales)),
  difference: sum(columns.map((item) => item.difference)), achievement: 118,
  transactions: sum(columns.map((item) => item.transactions)), pieces: sum(columns.map((item) => item.pieces)),
  traffic: 1_027, ept: 2_100, upt: 2.1, aur: 1_020, tc: 2.3,
  lossEpt: null, lossUpt: null, lossAur: null, waMeta: 1_381.06,
  waSales: sum(columns.map((item) => item.waSales ?? 0)), waTransactions: sum(columns.map((item) => item.waTransactions ?? 0)),
  waPieces: sum(columns.map((item) => item.waPieces ?? 0))
};

const state: WeeklyPerformanceState = {
  store: { id: "store-1", name: "TH SAN AGUSTIN" },
  reportWeek: { weekNumber: 33, weekStart: reportDates[0], weekEnd: reportDates[6], dates: reportDates },
  quotaWeek: { weekNumber: 34, weekStart: quotaDates[0], weekEnd: quotaDates[6], dates: quotaDates },
  status: "DRAFT", recordId: "close-1",
  quotaSavedAt: "2026-08-22T18:00:00.000Z", quotaSavedBy: "Gerencia",
  reportSavedAt: "2026-08-22T19:00:00.000Z", reportSavedBy: "Gerencia", reportDirty: false,
  finalizedAt: null, finalizedBy: null,
  plan: { minimums, upliftPercent: 15, whatsappBudget: 1_381.06 },
  quota,
  schedules: {},
  report: { columns, store, whatsappBudget: 1_381.06 },
  history: []
};

test("genera Cuota Justa y RDS como PDF Carta horizontal independientes", async () => {
  for (const document of ["quota", "rds"] as const) {
    const buffer = await buildWeeklyPerformancePdf(state, document);
    assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
    const pdf = await PDFDocument.load(buffer);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getPage(0).getWidth(), 792);
    assert.equal(pdf.getPage(0).getHeight(), 612);
    await writeVerificationPdf(document, buffer);
  }
});

test("el PDF completo conserva Cuota Justa y RDS como dos paginas", async () => {
  const buffer = await buildWeeklyPerformancePdf(state, "combined");
  const pdf = await PDFDocument.load(buffer);
  assert.equal(pdf.getPageCount(), 2);
  assert.deepEqual(pdf.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[792, 612], [792, 612]]);
  await writeVerificationPdf("combined", buffer);
});

test("el semaforo del PDF replica los umbrales del Excel", () => {
  assert.equal(rdsAchievementMarker(84.99, "pointOfSale"), "red");
  assert.equal(rdsAchievementMarker(85, "pointOfSale"), "black");
  assert.equal(rdsAchievementMarker(99.99, "pointOfSale"), "black");
  assert.equal(rdsAchievementMarker(100, "pointOfSale"), "star");
  assert.equal(rdsAchievementMarker(99.99, "whatsapp"), "red");
  assert.equal(rdsAchievementMarker(100, "whatsapp"), "star");
  assert.equal(rdsAchievementMarker(null, "whatsapp"), null);
});

async function writeVerificationPdf(name: string, buffer: Buffer) {
  const output = process.env.PDF_VERIFY_OUTPUT_DIR;
  if (!output) return;
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, `${name}.pdf`), buffer);
}
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
