/**
 * Construye `templates/kardex.xlsx` a partir del kardex real de la tienda.
 *
 * ⚠️ **No se abre con exceljs a propósito.** exceljs reescribe el libro entero y
 * en el camino destroza las tablas de Excel: el archivo resultante obligaba a
 * Excel a «repararlo», perdía el estilo de los encabezados e inventaba datos.
 * Este archivo se manda a corporativo para la toma de inventario, así que tiene
 * que llegar EXACTAMENTE como lo diseñaron.
 *
 * Aquí se edita el XLSX por dentro —es un ZIP de XML— tocando solo lo mínimo:
 * se borran las filas de datos de la tienda y se deja una fila vacía por hoja
 * que conserva los índices de estilo de cada columna. El exportador los reutiliza
 * para escribir las filas nuevas con el mismo formato.
 *
 * Uso: `pnpm exec tsx scripts/build-kardex-template.ts <archivo.xlsx>`
 */
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

/** hoja -> primera fila de datos (debajo del encabezado del formato). */
const DATA_START: Record<string, number> = {
  Ventas: 8,
  "Recepción Mercancia": 7,
  "Trans. Enviadas": 7,
  "Trans. recibidas": 7,
  SFS: 7
};

/** Celdas del resumen que dependen de la tienda y del inventario. */
const RESUMEN_CLEAR = ["C8", "C9", "F8", "I12"];

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Falta la ruta del kardex de origen.");
  const out = path.join(process.cwd(), "templates", "kardex.xlsx");

  const zip = await JSZip.loadAsync(await fs.readFile(source));
  const sheetPaths = await mapSheets(zip);

  for (const [name, start] of Object.entries(DATA_START)) {
    const file = sheetPaths.get(name);
    if (!file) throw new Error(`El origen no tiene la hoja «${name}».`);
    const xml = await zip.file(file)!.async("string");
    const cleaned = stripDataRows(xml, start);
    zip.file(file, cleaned.xml);
    console.log(`${name}: ${cleaned.removed} filas borradas, fila ${start} conservada como molde de estilos`);
  }

  // El resumen se limpia sin tocar sus fórmulas: solo los valores capturados.
  const resumenPath = sheetPaths.get("RESUMEN KARDEX")!;
  let resumen = await zip.file(resumenPath)!.async("string");
  for (const address of RESUMEN_CLEAR) resumen = clearCell(resumen, address);
  zip.file(resumenPath, resumen);
  console.log(`RESUMEN KARDEX: limpiadas ${RESUMEN_CLEAR.join(", ")}`);

  // Las tablas se encogen al encabezado más una fila: es el mínimo válido.
  for (const file of Object.keys(zip.files).filter((f) => /^xl\/tables\/table\d+\.xml$/.test(f))) {
    const xml = await zip.file(file)!.async("string");
    const ref = xml.match(/ ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/);
    if (!ref) continue;
    const header = Number(ref[2]);
    zip.file(file, setTableRef(xml, `${ref[1]}${header}:${ref[3]}${header + 1}`));
    console.log(`${path.basename(file)}: ref -> ${ref[1]}${header}:${ref[3]}${header + 1}`);
  }

  // Los resultados que Excel dejó en caché en cada fórmula son cifras reales de
  // la tienda. No deben vivir en el repo, y además un visor que no recalcule
  // (Google Sheets, una vista previa) mostraría totales equivocados con aire de
  // verdaderos. Sin caché muestra 0, que se lee como «esto aún no se ha
  // calculado» — que es la verdad.
  for (const [name, file] of sheetPaths) {
    const xml = await zip.file(file)!.async("string");
    const cleaned = stripFormulaCache(xml);
    if (cleaned.removed > 0) console.log(`${name}: ${cleaned.removed} resultados en caché borrados`);
    zip.file(file, cleaned.xml);
  }

  // La cadena de cálculo queda obsoleta al cambiar celdas y es una causa clásica
  // de que Excel «repare» el archivo. Se elimina: Excel la reconstruye sola.
  await removeCalcChain(zip);

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(out, buffer);
  console.log(`\nplantilla escrita en ${out} (${buffer.length} bytes)`);
}

/** Los nombres de hoja vienen escapados: «Recepción» llega como `Recepci&#243;n`. */
function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Nombre de hoja -> ruta de su XML, siguiendo workbook.xml y sus rels. */
async function mapSheets(zip: JSZip): Promise<Map<string, string>> {
  const workbook = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship Id="([^"]+)"[^>]*Target="(worksheets\/[^"]+)"/g)) {
    targets.set(match[1], `xl/${match[2]}`);
  }
  const sheets = new Map<string, string>();
  for (const match of workbook.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const file = targets.get(match[2]);
    if (file) sheets.set(decodeXml(match[1]), file);
  }
  return sheets;
}

/**
 * Borra las filas de datos y deja la primera vacía pero con sus estilos.
 *
 * Se conservan los atributos `s` de cada celda: son el molde con el que el
 * exportador escribe después, y sin ellos las fechas saldrían como números y las
 * filas perderían bordes y fuentes.
 */
function stripDataRows(xml: string, start: number): { xml: string; removed: number } {
  let removed = 0;
  let molde: string | null = null;

  const result = xml.replace(/<row r="(\d+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g, (row, raw) => {
    const index = Number(raw);
    if (index < start) return row;
    if (index === start) {
      molde = row.replace(/<c ([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (_cell, attrs: string) => {
        // Se descarta el tipo (`t="s"`) porque ya no hay valor al que apuntar.
        const kept = attrs.replace(/\st="[^"]*"/g, "").trim();
        return `<c ${kept}/>`;
      });
      return molde;
    }
    removed++;
    return "";
  });

  if (!molde) throw new Error(`No se encontró la fila ${start} para usarla de molde.`);
  return { xml: result, removed };
}

/**
 * Borra el resultado en caché de las fórmulas, conservando la fórmula.
 *
 * Una celda `<c ...><f>SUM(...)</f><v>8220</v></c>` queda como
 * `<c ...><f>SUM(...)</f></c>`. Excel la calcula al abrir; lo que se va es el
 * número viejo, que era dato real de la tienda.
 */
function stripFormulaCache(xml: string): { xml: string; removed: number } {
  let removed = 0;
  const result = xml.replace(/(<f[^>]*>[\s\S]*?<\/f>|<f[^>]*\/>)\s*<v>[\s\S]*?<\/v>/g, (_match, formula: string) => {
    removed++;
    return formula;
  });
  return { xml: result, removed };
}

/** Deja la celda sin valor pero con su estilo. */
function clearCell(xml: string, address: string): string {
  const pattern = new RegExp(`<c r="${address}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  if (!pattern.test(xml)) return xml;
  return xml.replace(pattern, (_match, attrs: string) => `<c r="${address}"${attrs.replace(/\st="[^"]*"/g, "")}/>`);
}

function setTableRef(xml: string, ref: string): string {
  return xml
    .replace(/ ref="[^"]+"/, ` ref="${ref}"`)
    .replace(/<autoFilter ref="[^"]+"/, `<autoFilter ref="${ref}"`);
}

/** Quita calcChain.xml y las dos referencias que lo declaran. */
async function removeCalcChain(zip: JSZip) {
  if (!zip.file("xl/calcChain.xml")) return;
  zip.remove("xl/calcChain.xml");

  const types = zip.file("[Content_Types].xml");
  if (types) {
    const xml = await types.async("string");
    zip.file("[Content_Types].xml", xml.replace(/<Override[^>]*calcChain\.xml"[^>]*\/>/g, ""));
  }
  const rels = zip.file("xl/_rels/workbook.xml.rels");
  if (rels) {
    const xml = await rels.async("string");
    zip.file("xl/_rels/workbook.xml.rels", xml.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/g, ""));
  }
}

main().catch((error) => {
  console.error("FALLO:", error);
  process.exitCode = 1;
});
