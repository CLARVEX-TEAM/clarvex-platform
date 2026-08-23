import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { columnLetter, mapSheets, readPart, writeCell } from "@/lib/kardex-xlsx";
import { firstName } from "@/lib/weekly-close";
import type { WeeklyPerformanceState } from "@/lib/weekly-performance";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "cuota-justa-rds.xlsx");
const DAY_COLUMNS = ["D", "F", "H", "J", "L", "N", "P"];
const RDS_COLUMNS = Array.from({ length: 10 }, (_, index) => columnLetter(4 + index));
export type WeeklyPerformanceDocument = "combined" | "quota" | "rds";

export async function buildWeeklyPerformanceWorkbook(
  state: WeeklyPerformanceState,
  document: WeeklyPerformanceDocument = "combined"
) {
  const people = state.quota.days[0]?.allocations ?? [];
  const peopleById = new Map(people.map((person) => [person.userId, person]));
  if (people.length > 10) throw new Error("El formato original admite un máximo de 10 colaboradores.");
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const sheets = await mapSheets(zip);

  const cjPath = requiredSheet(sheets, "CJ");
  let cj = expandSharedFormulas(await readPart(zip, cjPath));
  cj = writeCell(cj, "J2", state.store.name);
  cj = writeCell(cj, "T2", state.quotaWeek.weekNumber);
  state.quota.days.forEach((day, index) => {
    const left = DAY_COLUMNS[index];
    const right = columnLetter(columnIndex(left) + 1);
    const date = new Date(`${day.date}T00:00:00.000Z`);
    cj = writeCell(cj, `${left}6`, date);
    cj = writeCell(cj, `${right}6`, date);
    cj = writeCell(cj, `${left}8`, day.minimum);
    cj = writeCell(cj, `${right}8`, day.minimum);
    const dailyWhatsapp = round2(state.plan.whatsappBudget / 7);
    cj = writeCell(cj, `${left}27`, dailyWhatsapp);
    cj = writeCell(cj, `${right}27`, dailyWhatsapp);
  });

  for (let index = 0; index < 10; index += 1) {
    const quotaRow = 14 + index;
    const whatsappRow = 29 + index;
    const person = people[index];
    if (!person) {
      cj = clearRange(cj, quotaRow, 3, 20);
      cj = clearRange(cj, whatsappRow, 3, 20);
      continue;
    }
    const displayName = firstName(person.name);
    cj = writeCell(cj, `C${quotaRow}`, displayName);
    cj = writeCell(cj, `C${whatsappRow}`, displayName);
    state.quota.days.forEach((day, dayIndex) => {
      const allocation = day.allocations.find((item) => item.userId === person.userId);
      cj = writeCell(cj, `${DAY_COLUMNS[dayIndex]}${quotaRow}`, (allocation?.percentage ?? 0) / 100);
    });
  }
  cj = clearFormulaCaches(cj);
  const rdsPath = requiredSheet(sheets, "RDS");
  let rds = expandSharedFormulas(await readPart(zip, rdsPath));
  rds = writeCell(rds, "H2", state.store.name);
  rds = writeCell(rds, "M2", state.reportWeek.weekNumber);
  for (let index = 0; index < 10; index += 1) {
    const column = RDS_COLUMNS[index];
    const report = state.report.columns[index];
    if (!report) {
      for (let row = 6; row <= 29; row += 1) rds = writeCell(rds, `${column}${row}`, null);
      continue;
    }
    const fullName = peopleById.get(report.userId)?.name ?? report.name;
    rds = writeCell(rds, `${column}6`, firstName(fullName));
    // RDS resume la semana historica seleccionada. La plantilla enlaza estas
    // celdas a CJ, pero CJ contiene la cuota de la semana siguiente.
    rds = writeCell(rds, `${column}7`, report.goal);
    rds = writeCell(rds, `${column}8`, report.sales);
    rds = writeCell(rds, `${column}11`, report.transactions);
    rds = writeCell(rds, `${column}12`, report.pieces);
    rds = writeCell(rds, `${column}13`, report.traffic ?? 0);
    rds = writeCell(rds, `${column}25`, report.waMeta);
    rds = writeCell(rds, `${column}26`, report.waSales ?? 0);
    rds = writeCell(rds, `${column}28`, report.waTransactions ?? 0);
    rds = writeCell(rds, `${column}29`, report.waPieces ?? 0);
  }
  // El tráfico total de tienda es el único total de esa sección que el formato
  // original trae como dato y no como SUMA de columnas.
  rds = writeCell(rds, "O13", state.report.store.traffic ?? 0);
  rds = clearFormulaCaches(rds);
  const schedulesPath = sheets.get("HORARIOS");
  if (schedulesPath) zip.file(schedulesPath, clearAllFormulaCells(await readPart(zip, schedulesPath)));
  const workbook = selectDocumentSheets(await readPart(zip, "xl/workbook.xml"), document);
  zip.file("xl/workbook.xml", forceFullRecalculation(workbook));
  zip.file(cjPath, selectWorksheet(cj, document !== "rds"));
  zip.file(rdsPath, selectWorksheet(rds, document === "rds"));
  await removeStaleCalculationParts(zip);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function clearRange(xml: string, row: number, from: number, to: number) {
  let next = xml;
  for (let column = from; column <= to; column += 1) next = writeCell(next, `${columnLetter(column)}${row}`, null);
  return next;
}

/**
 * Convierte los grupos `<f t="shared">` de la plantilla en formulas A1
 * independientes. Despues podemos vaciar personas/columnas no utilizadas sin
 * dejar un `ref` compartido apuntando a celdas que ya no contienen formula.
 */
function expandSharedFormulas(xml: string) {
  const anchors = new Map<string, { address: string; formula: string }>();
  for (const cell of xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*?(?<!\/)>([\s\S]*?)<\/c>/g)) {
    const formula = cell[2].match(/<f\b([^>]*\bt="shared"[^>]*)>([\s\S]*?)<\/f>/);
    const sharedIndex = formula?.[1].match(/\bsi="(\d+)"/)?.[1];
    if (sharedIndex !== undefined && formula?.[2]) {
      anchors.set(sharedIndex, { address: cell[1], formula: formula[2] });
    }
  }

  return xml.replace(
    /<c r="([A-Z]+\d+)"([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g,
    (cell, address: string, attrs: string, body: string) => {
      const expanded = body.replace(
        /<f\b([^>]*\bt="shared"[^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/,
        (formulaTag, formulaAttrs: string, formula: string | undefined) => {
          if (formula) return `<f>${formula}</f>`;
          const sharedIndex = formulaAttrs.match(/\bsi="(\d+)"/)?.[1];
          const anchor = sharedIndex === undefined ? undefined : anchors.get(sharedIndex);
          if (!anchor) throw new Error(`Formula compartida sin ancla en ${address}.`);
          return `<f>${translateFormula(anchor.formula, anchor.address, address)}</f>`;
        }
      );
      return expanded === body ? cell : `<c r="${address}"${attrs}>${expanded}</c>`;
    }
  );
}

function translateFormula(formula: string, sourceAddress: string, targetAddress: string) {
  const source = splitAddress(sourceAddress);
  const target = splitAddress(targetAddress);
  const columnOffset = target.column - source.column;
  const rowOffset = target.row - source.row;
  return formula.replace(
    /(?<![A-Z0-9_])(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
    (reference, absoluteColumn: string, letters: string, absoluteRow: string, rowText: string) => {
      const column = columnIndex(letters) + (absoluteColumn ? 0 : columnOffset);
      const row = Number(rowText) + (absoluteRow ? 0 : rowOffset);
      if (column < 1 || row < 1) throw new Error(`Referencia invalida al expandir ${reference} en ${targetAddress}.`);
      return `${absoluteColumn}${columnLetter(column)}${absoluteRow}${row}`;
    }
  );
}

function splitAddress(address: string) {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Celda invalida: ${address}.`);
  return { column: columnIndex(match[1]), row: Number(match[2]) };
}

/** Conserva cada fórmula, pero quita resultados viejos y errores cacheados. */
function clearFormulaCaches(xml: string) {
  return xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g,
    (match, address: string, attrs: string, body: string) => {
      const formula = body.match(/<f[^>]*\/>|<f[^>]*>[\s\S]*?<\/f>/)?.[0];
      if (!formula) return match;
      const cleanAttrs = attrs.replace(/\st="(?:e|str)"/g, "");
      return `<c r="${address}"${cleanAttrs}>${formula}</c>`;
    });
}

/** HORARIOS ya no alimenta la cuota; elimina sus referencias #REF heredadas. */
function clearAllFormulaCells(xml: string) {
  return xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g,
    (match, address: string, attrs: string, body: string) => {
      if (!/<f(?:\s|>|\/)/.test(body)) return match;
      const style = attrs.match(/\ss="\d+"/)?.[0] ?? "";
      return `<c r="${address}"${style}/>`;
    });
}

function forceFullRecalculation(xml: string) {
  const calc = '<calcPr calcId="191028" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>';
  return /<calcPr[^>]*\/>/.test(xml) ? xml.replace(/<calcPr[^>]*\/>/, calc) : xml.replace("</workbook>", `${calc}</workbook>`);
}

/**
 * calcChain es opcional, pero si se elimina la parte tambien deben eliminarse
 * sus declaraciones. HORARIOS era la unica hoja con metadatos de matrices
 * dinamicas; al vaciar sus formulas ya no queda ninguna celda `cm`/`vm`, por lo
 * que metadata.xml tambien queda huerfano. Cualquiera de esas referencias hace
 * que Excel repare el archivo antes de abrirlo.
 */
async function removeStaleCalculationParts(zip: JSZip) {
  zip.remove("xl/calcChain.xml");
  zip.remove("xl/metadata.xml");
  const contentTypesPath = "[Content_Types].xml";
  const relationshipsPath = "xl/_rels/workbook.xml.rels";
  const contentTypes = await readPart(zip, contentTypesPath);
  const relationships = await readPart(zip, relationshipsPath);
  zip.file(
    contentTypesPath,
    contentTypes.replace(/<Override[^>]*(?:calcChain|metadata)\.xml"[^>]*\/>/g, "")
  );
  zip.file(
    relationshipsPath,
    relationships.replace(/<Relationship[^>]*(?:calcChain|metadata)\.xml"[^>]*\/>/g, "")
  );
}

/**
 * Conserva todas las hojas para no romper formulas, nombres definidos ni
 * estilos. Los archivos individuales solo ocultan la seccion no solicitada.
 */
function selectDocumentSheets(xml: string, document: WeeklyPerformanceDocument) {
  const states: Record<WeeklyPerformanceDocument, { activeTab: number; hidden: string | null }> = {
    combined: { activeTab: 1, hidden: null },
    quota: { activeTab: 1, hidden: "RDS" },
    rds: { activeTab: 2, hidden: "CJ" }
  };
  const selection = states[document];
  let next = xml.replace(
    /<workbookView\b([^>]*?)\bactiveTab="\d+"([^>]*)\/>/,
    `<workbookView$1activeTab="${selection.activeTab}"$2/>`
  );
  next = next.replace(
    /<sheet\b([^>]*?)\bname="(CJ|RDS)"([^>]*?)\sstate="(?:hidden|veryHidden)"([^>]*)\/>/g,
    '<sheet$1name="$2"$3$4/>'
  );
  if (selection.hidden) {
    next = next.replace(
      new RegExp(`<sheet\\b([^>]*?)\\bname="${selection.hidden}"([^>]*)\\/>`),
      `<sheet$1name="${selection.hidden}"$2 state="hidden"/>`
    );
  }
  return next;
}

function selectWorksheet(xml: string, selected: boolean) {
  let next = xml.replace(/\stabSelected="1"/g, "");
  if (selected) next = next.replace(/<sheetView\b/, '<sheetView tabSelected="1"');
  return next;
}
function requiredSheet(sheets: Map<string, string>, name: string) {
  const value = sheets.get(name);
  if (!value) throw new Error(`La plantilla no tiene la hoja «${name}».`);
  return value;
}
function columnIndex(letters: string) {
  let value = 0;
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
  return value;
}
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
