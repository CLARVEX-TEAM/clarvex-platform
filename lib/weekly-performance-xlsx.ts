import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { columnLetter, mapSheets, readPart, writeCell } from "@/lib/kardex-xlsx";
import type { WeeklyPerformanceState } from "@/lib/weekly-performance";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "cuota-justa-rds.xlsx");
const DAY_COLUMNS = ["D", "F", "H", "J", "L", "N", "P"];
const RDS_COLUMNS = Array.from({ length: 10 }, (_, index) => columnLetter(4 + index));

export async function buildWeeklyPerformanceWorkbook(state: WeeklyPerformanceState) {
  const people = state.quota.days[0]?.allocations ?? [];
  if (people.length > 10) throw new Error("El formato original admite un máximo de 10 colaboradores.");
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE_PATH));
  const sheets = await mapSheets(zip);

  const cjPath = requiredSheet(sheets, "CJ");
  let cj = await readPart(zip, cjPath);
  cj = writeCell(cj, "J2", state.store.name);
  cj = writeCell(cj, "T2", state.week.weekNumber);
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
    cj = writeCell(cj, `C${quotaRow}`, person.name);
    state.quota.days.forEach((day, dayIndex) => {
      const allocation = day.allocations.find((item) => item.userId === person.userId);
      cj = writeCell(cj, `${DAY_COLUMNS[dayIndex]}${quotaRow}`, (allocation?.percentage ?? 0) / 100);
    });
  }
  cj = clearFormulaCaches(cj);
  zip.file(cjPath, cj);

  const rdsPath = requiredSheet(sheets, "RDS");
  let rds = await readPart(zip, rdsPath);
  rds = writeCell(rds, "M2", state.week.weekNumber);
  for (let index = 0; index < 10; index += 1) {
    const column = RDS_COLUMNS[index];
    const report = state.report.columns[index];
    if (!report) {
      for (let row = 6; row <= 29; row += 1) rds = writeCell(rds, `${column}${row}`, null);
      continue;
    }
    rds = writeCell(rds, `${column}8`, report.sales);
    rds = writeCell(rds, `${column}11`, report.transactions);
    rds = writeCell(rds, `${column}12`, report.pieces);
    rds = writeCell(rds, `${column}13`, report.traffic ?? 0);
    rds = writeCell(rds, `${column}26`, report.waSales ?? 0);
    rds = writeCell(rds, `${column}28`, report.waTransactions ?? 0);
    rds = writeCell(rds, `${column}29`, report.waPieces ?? 0);
  }
  // El tráfico total de tienda es el único total de esa sección que el formato
  // original trae como dato y no como SUMA de columnas.
  rds = writeCell(rds, "O13", state.report.store.traffic ?? 0);
  rds = clearFormulaCaches(rds);
  zip.file(rdsPath, rds);

  const schedulesPath = sheets.get("HORARIOS");
  if (schedulesPath) zip.file(schedulesPath, clearAllFormulaCells(await readPart(zip, schedulesPath)));
  zip.file("xl/workbook.xml", forceFullRecalculation(await readPart(zip, "xl/workbook.xml")));
  zip.remove("xl/calcChain.xml");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function clearRange(xml: string, row: number, from: number, to: number) {
  let next = xml;
  for (let column = from; column <= to; column += 1) next = writeCell(next, `${columnLetter(column)}${row}`, null);
  return next;
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
