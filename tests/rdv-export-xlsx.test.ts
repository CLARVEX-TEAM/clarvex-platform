import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  asignarBloques, buildRdvFilename, buildRdvWorkbook, mostrarColumnas, type RdvExportState } from "../lib/rdv-export-xlsx";

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
  // ⚠️ Esta prueba daba por bueno `Z6 = "VENDEDOR 1"`, que era el fallo: la
  // columna Z es el bloque 3 y la plantilla lo tiene cableado como
  // SUBGERENTE 2. Una asesora ahi cobraba con el porcentaje de subgerente y
  // sobre la venta de tienda.
  assert.equal(daily.getCell("Z6").value, null, "el bloque 3 es SUBGERENTE 2 y aqui no hay segundo subgerente");
  assert.equal(daily.getCell("AK6").value, "VENDEDOR 1");
  assert.equal(daily.getCell("AK8").value, "Waira Popoca");

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
  // Los datos de la asesora viajan con ella: del bloque 3 (Z) al 4 (AK).
  assert.equal(daily.getCell("Z10").value, null);
  assert.equal(daily.getCell("AK10").value, 8_000);
  assert.equal(daily.getCell("AL10").value, 2_500);
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

/* ─── columnas ocultas de la plantilla ────────────────────────────────────── */

test("⚠️ muestra el bloque de persona que la plantilla traia OCULTO", () => {
  // La plantilla corporativa llega con las columnas 26-36 escondidas. Escribir
  // dentro no las muestra: los datos quedan bien y no se ven. Paso con Waira,
  // que cae en ese bloque, y parecia que el export la habia perdido.
  const antes = '<cols><col min="26" max="36" width="9" hidden="1"/></cols>';
  const despues = mostrarColumnas(antes, 4, 58);
  assert.ok(!despues.includes('hidden="1"'), despues);
  assert.ok(despues.includes('min="26"') && despues.includes('max="36"'));
});

test("los bloques que sobran siguen ocultos", () => {
  // Enseñar columnas vacias ensucia el reporte.
  const antes = '<cols><col min="70" max="168" width="9" hidden="1"/></cols>';
  assert.equal(mostrarColumnas(antes, 4, 58), antes);
});

test("un rango a medias se parte en tres", () => {
  // 20-40 con cinco personas (hasta la 58): lo de antes de 26 no existe aqui,
  // pero el corte por arriba si tiene que respetarse.
  const antes = '<cols><col min="50" max="80" width="9" hidden="1"/></cols>';
  const despues = mostrarColumnas(antes, 4, 58);
  // 50-58 visible, 59-80 sigue oculto.
  assert.ok(despues.includes('min="50"') && despues.includes('max="58"'));
  assert.ok(/min="59"[^>]*max="80"[^>]*hidden="1"|min="59"[^>]*hidden="1"[^>]*max="80"/.test(despues), despues);
});

test("una columna visible no se toca", () => {
  const antes = '<cols><col min="4" max="14" width="9"/></cols>';
  assert.equal(mostrarColumnas(antes, 4, 58), antes);
});

/* ─── cada quien en el bloque de su puesto ────────────────────────────────── */

const persona = (name: string, role: "GERENTE" | "SUBGERENTE" | "ASESOR", employeeNumber: string) =>
  ({ userId: name, name, role, employeeNumber });

test("⚠️ una asesora NO cae en el bloque de SUBGERENTE 2", () => {
  // Es el fallo de agosto de 2026: Waira caia en el bloque 3, que la plantilla
  // tiene cableado como SUBGERENTE 2, y el Excel le calculaba 0.93/1.16/1.39
  // sobre la venta de TIENDA en vez de 1.53/1.91/2.29 sobre la suya.
  const bloques = asignarBloques([
    persona("ITZEL", "GERENTE", "81893"),
    persona("ADRIAN", "SUBGERENTE", "102259"),
    persona("WAIRA", "ASESOR", "95739"),
    persona("JAZMIN", "ASESOR", "96383"),
    persona("ALONSO", "ASESOR", "113642")
  ]);
  assert.equal(bloques[0]?.name, "ITZEL");
  assert.equal(bloques[1]?.name, "ADRIAN");
  assert.equal(bloques[2], null, "el bloque 3 es SUBGERENTE 2 y esta tienda no tiene");
  assert.equal(bloques[3]?.name, "WAIRA");
  assert.equal(bloques[4]?.name, "JAZMIN");
  assert.equal(bloques[5]?.name, "ALONSO");
});

test("con dos subgerentes el bloque 3 si se ocupa", () => {
  const bloques = asignarBloques([
    persona("G", "GERENTE", "1"),
    persona("S1", "SUBGERENTE", "2"),
    persona("S2", "SUBGERENTE", "3"),
    persona("A1", "ASESOR", "4")
  ]);
  assert.deepEqual(bloques.slice(0, 4).map((p) => p?.name ?? null), ["G", "S1", "S2", "A1"]);
});

test("una tienda sin gerente deja su bloque vacio, no lo rellena", () => {
  const bloques = asignarBloques([persona("S1", "SUBGERENTE", "2"), persona("A1", "ASESOR", "4")]);
  assert.equal(bloques[0], null);
  assert.equal(bloques[1]?.name, "S1");
  assert.equal(bloques[3]?.name, "A1");
});

test("⚠️ si sobra alguien de un puesto se DETIENE, no se le busca hueco", () => {
  // Colocarlo en el bloque libre mas cercano es exactamente el fallo que esto
  // arregla: cobraria con el porcentaje de otro puesto.
  assert.throws(
    () => asignarBloques([
      persona("S1", "SUBGERENTE", "1"),
      persona("S2", "SUBGERENTE", "2"),
      persona("S3", "SUBGERENTE", "3")
    ]),
    /SUBGERENTE/
  );
});
