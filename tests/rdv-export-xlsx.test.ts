import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  buildRdvFilename, buildRdvWorkbook, type RdvExportState } from "../lib/rdv-export-xlsx";

const state: RdvExportState = {
  store: { id: "store-1", name: "TH SAN AGUSTIN" },
  document: {
    brand: "TOMMY HILFIGER",
    center: "San Agustín",
    classification: "3",
    crmObjective: 1,
    monthName: "AGOSTO"
  },
  retailMonth: {
    label: "Agosto 2026",
    start: "2026-08-02",
    end: "2026-08-29",
    weeks: [
      { weekNumber: 31, weekStart: "2026-08-02", weekEnd: "2026-08-08" },
      { weekNumber: 32, weekStart: "2026-08-09", weekEnd: "2026-08-15" },
      { weekNumber: 33, weekStart: "2026-08-16", weekEnd: "2026-08-22" },
      { weekNumber: 34, weekStart: "2026-08-23", weekEnd: "2026-08-29" }
    ]
  },
  people: [
    { userId: "g", name: "Itzel Reyes", role: "GERENTE", employeeNumber: "81893" },
    { userId: "s", name: "Jesus Hernandez", role: "SUBGERENTE", employeeNumber: "102259" },
    { userId: "a1", name: "Waira Popoca", role: "ASESOR", employeeNumber: "95739" }
  ],
  days: [
    {
      date: "2026-08-02",
      weekNumber: 31,
      traffic: 294,
      kpis: [
        {
          userId: "g",
          date: "2026-08-02",
          dailyGoal: 10_000,
          dailySales: 12_345.67,
          transactions: 6,
          pieces: 9,
          crmTransactions: 4,
          orkestraSales: 300.5,
          orkestraTransactions: 1,
          orkestraPieces: 1
        },
        {
          userId: "a1",
          date: "2026-08-02",
          dailyGoal: 8_000,
          dailySales: 2_500,
          transactions: 3,
          pieces: 5,
          crmTransactions: null,
          orkestraSales: null,
          orkestraTransactions: null,
          orkestraPieces: null
        }
      ]
    }
  ]
};

test("rellena el RDV preservando formato, formulas y hojas del archivo base", async () => {
  const buffer = await buildRdvWorkbook(state);
  if (process.env.XLSX_VERIFY_RDV_OUTPUT) await fs.writeFile(process.env.XLSX_VERIFY_RDV_OUTPUT, buffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "Informe",
    "Diario de ventas",
    "KPIs Generales PDV",
    "KPIs x Colaborador",
    "COMISIONES"
  ]);

  const daily = workbook.getWorksheet("Diario de ventas")!;
  assert.equal(daily.getCell("D1").value, "TOMMY HILFIGER");
  assert.equal(daily.getCell("D2").value, "San Agustín");
  assert.equal(daily.getCell("D3").value, "3");
  assert.equal(daily.getCell("D4").value, 1);
  assert.equal(daily.getCell("D5").value, "AGOSTO");
  assert.equal(daily.getCell("A10").value, "Semana 31");
  assert.equal(daily.getCell("B10").value, "DOM");
  assert.equal((daily.getCell("C10").value as Date).toISOString().slice(0, 10), "2026-08-02");
  assert.equal(daily.getCell("A38").value, null);
  assert.equal(daily.getCell("C38").value, null);

  assert.equal(daily.getCell("D6").value, "GERENTE");
  assert.equal(daily.getCell("D7").value, "81893");
  assert.equal(daily.getCell("D8").value, "Itzel Reyes");
  assert.equal(daily.getCell("O6").value, "SUBGERENTE 1");
  assert.equal(daily.getCell("Z6").value, "VENDEDOR 1");
  assert.equal(daily.getCell("AK6").value, null);

  assert.equal(daily.getCell("D10").value, 10_000);
  assert.equal(daily.getCell("E10").value, 12_345.67);
  assert.equal(daily.getCell("F10").value, 6);
  assert.equal(daily.getCell("G10").value, 9);
  assert.equal(daily.getCell("H10").value, 4);
  assert.equal(daily.getCell("I10").value, null);
  assert.equal(daily.getCell("J10").value, 300.5);
  assert.equal(daily.getCell("K10").value, 1);
  assert.equal(daily.getCell("L10").value, 1);
  assert.equal(daily.getCell("M10").value, null);
  assert.equal(daily.getCell("N10").value, null);
  assert.equal(daily.getCell("Z10").value, 8_000);
  assert.equal(daily.getCell("AA10").value, 2_500);
  assert.equal(daily.getCell("FM10").value, 294);

  const collaborator = workbook.getWorksheet("KPIs x Colaborador")!;
  assert.equal(formula(collaborator.getCell("A4").value), "'Diario de ventas'!D6");
  assert.equal(formula(collaborator.getCell("D4").value), "'Diario de ventas'!D45");

  const zip = await JSZip.loadAsync(buffer);
  assert.equal(Boolean(zip.file("xl/calcChain.xml")), false);
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(workbookXml, /activeTab="1"/);
  assert.match(workbookXml, /forceFullCalc="1"/);
  for (const name of Object.keys(zip.files).filter((part) => /^xl\/worksheets\/sheet\d+\.xml$/.test(part))) {
    assert.doesNotMatch(await zip.file(name)!.async("string"), /<f[^>]*t="shared"/);
  }
  for (const name of Object.keys(zip.files).filter((part) => /^xl\/charts\/chart\d+\.xml$/.test(part))) {
    const xml = await zip.file(name)!.async("string");
    assert.doesNotMatch(xml, /<c:(?:str|num)Cache>/);
  }
});

test("la plantilla RDV versionada no conserva nombres ni importes del archivo recibido", async () => {
  const zip = await JSZip.loadAsync(await fs.readFile("templates/rdv.xlsx"));
  const parts = await Promise.all(
    Object.keys(zip.files)
      .filter((name) => !zip.files[name].dir && /\.xml$|\.rels$/.test(name))
      .map((name) => zip.file(name)!.async("string"))
  );
  const text = parts.join("\n").toLowerCase();
  for (const forbidden of ["itzel", "waira", "jazmín", "eduardo", "81893", "102259", "764003"]) {
    assert.equal(text.includes(forbidden), false, `La plantilla conserva ${forbidden}`);
  }
});

test("rechaza periodos que no caben en la plantilla RDV", async () => {
  await assert.rejects(
    () => buildRdvWorkbook({
      ...state,
      retailMonth: {
        ...state.retailMonth,
        weeks: [...state.retailMonth.weeks, { weekNumber: 35, weekStart: "2026-08-30", weekEnd: "2026-09-05" }, { weekNumber: 36, weekStart: "2026-09-06", weekEnd: "2026-09-12" }]
      }
    }),
    /máximo 5 semanas/
  );
});

function formula(value: unknown) {
  return value && typeof value === "object" && "formula" in value ? value.formula : value;
}

test("el archivo se llama RDV <tienda> <MES RETAIL> <año>", () => {
  // ⚠️ El mes es el RETAIL, no el natural: agosto de 2026 va del 2 al 29. Sale
  // de la misma etiqueta que llena la portada, para que el nombre no pueda
  // decir un mes y el contenido otro.
  const nombre = buildRdvFilename({
    store: { id: "s1", name: "TH San Agustín" },
    retailMonth: { label: "Agosto 2026", start: "2026-08-02", end: "2026-08-29", weeks: [] }
  });
  assert.equal(nombre, "RDV TH SAN AGUSTIN AGOSTO 2026.xlsx");
});

test("un nombre de tienda con signos raros no rompe la descarga", () => {
  // `/`, `:` y compañia rompen la descarga en Windows o llegan mal por la
  // cabecera Content-Disposition.
  const nombre = buildRdvFilename({
    store: { id: "s1", name: "GUESS Galerías / Monterrey" },
    retailMonth: { label: "Mayo 2026", start: "2026-05-03", end: "2026-05-30", weeks: [] }
  });
  assert.equal(nombre, "RDV GUESS GALERIAS MONTERREY MAYO 2026.xlsx");
});
