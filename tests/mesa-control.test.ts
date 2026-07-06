import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { fillMesaControl } from "../lib/mesa-control";

const TEMPLATE = path.join(process.cwd(), "templates", "mesa-de-control.xlsx");

test("rellena la plantilla oficial sin romper su estructura", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE);

  fillMesaControl(workbook, {
    date: new Date("2026-07-20T00:00:00.000Z"),
    theoretical: 7100,
    piso: [
      { number: 1, count1: 21, count2: null, count3: null },
      { number: 2, count1: 18, count2: 17, count3: 17 }
    ],
    bodega: [{ number: 61, count1: 88, count2: null, count3: null }],
    noUpc: [{ concept: "Cinturones sin etiqueta", pieces: 4 }],
    team: { gerente: "ITZEL REYES", subgerente: null, vendedores: ["ALONSO", "WAIRA", "JAZMIN"] }
  });

  // Ida y vuelta: el libro debe poder reescribirse y releerse.
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer as ArrayBuffer);

  assert.deepEqual(
    reloaded.worksheets.map((sheet) => sheet.name),
    ["Instructivo de Vaciado", "Resumen", "Piso de Venta", "Bodega", "Piezas Sin UPC"]
  );

  const resumen = reloaded.getWorksheet("Resumen")!;
  assert.equal(resumen.getCell("F19").value, 7100);
  assert.equal(resumen.getCell("G24").value, "ITZEL REYES");
  assert.equal(resumen.getCell("G26").value, "ALONSO");
  assert.equal(resumen.getCell("K24").value, null); // sin 4to vendedor

  const piso = reloaded.getWorksheet("Piso de Venta")!;
  assert.equal(piso.getCell("B14").value, 1);
  assert.equal(piso.getCell("C14").value, 21);
  assert.equal(piso.getCell("C15").value, 18);
  assert.equal(piso.getCell("D15").value, 17);
  assert.equal(piso.getCell("F15").value, 17);
  // Los datos del conteo original de la plantilla quedaron limpios.
  assert.equal(piso.getCell("B16").value, null);
  assert.equal(piso.getCell("C16").value, null);
  // Las fórmulas de la plantilla siguen ahí (Diferencia y Real).
  const diff = piso.getCell("E14").value as { formula?: string; sharedFormula?: string } | null;
  assert.ok(diff && typeof diff === "object" && ("formula" in diff || "sharedFormula" in diff));

  const bodega = reloaded.getWorksheet("Bodega")!;
  assert.equal(bodega.getCell("B14").value, 61);
  assert.equal(bodega.getCell("C14").value, 88);
  assert.equal(bodega.getCell("B15").value, null);

  const noUpc = reloaded.getWorksheet("Piezas Sin UPC")!;
  assert.equal(noUpc.getCell("B14").value, "Cinturones sin etiqueta");
  assert.equal(noUpc.getCell("C14").value, 4);
});
