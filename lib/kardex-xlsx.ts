import JSZip from "jszip";

/**
 * Escritura quirúrgica dentro de un XLSX, sin regenerar el libro.
 *
 * ⚠️ **Aquí no se usa exceljs, y es deliberado.** exceljs reescribe el archivo
 * entero y en el camino destroza las tablas de Excel: Excel abría el resultado
 * «reparándolo», los encabezados perdían su fondo y la reparación llegaba a
 * inventar datos. El kardex se manda a corporativo para la toma de inventario,
 * así que tiene que llegar EXACTAMENTE como lo diseñaron.
 *
 * Un XLSX es un ZIP de XML. Se toca solo lo imprescindible —las filas de datos,
 * el rango de cada tabla y cuatro celdas del resumen— y todo lo demás (estilos,
 * imágenes, comentarios, extensiones, fórmulas) viaja intacto.
 *
 * Los totales **no se escriben**: se marca el libro para que Excel recalcule al
 * abrirlo, y son las fórmulas originales las que los producen. Es lo que
 * mantiene el archivo vivo en vez de convertirlo en una foto de números.
 */

/** Día 0 de Excel: 1899-12-30 (el sistema de 1900, con su bisiesto inexistente). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export type CellValue = Date | string | number | null;

export function toExcelSerial(date: Date): number {
  return Math.round((date.getTime() - EXCEL_EPOCH_UTC) / DAY_MS);
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Índice de columna (1) -> letra (A). */
export function columnLetter(index: number): string {
  let value = "";
  let rest = index;
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    rest = Math.floor((rest - 1) / 26);
  }
  return value;
}

/** Nombre de hoja -> ruta de su XML dentro del ZIP. */
export async function mapSheets(zip: JSZip): Promise<Map<string, string>> {
  const workbook = await readPart(zip, "xl/workbook.xml");
  const rels = await readPart(zip, "xl/_rels/workbook.xml.rels");
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

export async function readPart(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`La plantilla no tiene la parte «${path}».`);
  return file.async("string");
}

/**
 * Estilo de cada columna, leído de la fila molde que dejó la plantilla.
 *
 * Sin esto las fechas saldrían como números crudos y las filas perderían borde y
 * fuente: el formato de una celda vive en su atributo `s`, no en el valor.
 */
export type RowTemplate = { attrs: string; styles: Map<number, string> };

export function readRowTemplate(xml: string, row: number): RowTemplate {
  const match = xml.match(new RegExp(`<row r="${row}"([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/row>)`));
  if (!match) throw new Error(`La plantilla no tiene la fila molde ${row}.`);
  const styles = new Map<number, string>();
  for (const cell of (match[2] ?? "").matchAll(/<c r="([A-Z]+)\d+"([^>]*?)\/?>/g)) {
    const style = cell[2].match(/\ss="(\d+)"/)?.[1];
    if (style) styles.set(columnIndex(cell[1]), style);
  }
  return { attrs: match[1], styles };
}

export function columnIndex(letters: string): number {
  let value = 0;
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
  return value;
}

/**
 * Sustituye el bloque de filas de datos por el generado.
 *
 * La plantilla dejó una sola fila (la molde) a partir de `start`, así que basta
 * con reemplazarla: no hay filas posteriores que reordenar.
 */
export function replaceDataRows(
  xml: string,
  start: number,
  firstColumn: number,
  rows: CellValue[][],
  template: RowTemplate
): string {
  const generated =
    rows.length === 0
      ? emptyRow(start, template)
      : rows.map((values, index) => buildRow(start + index, firstColumn, values, template)).join("");

  const pattern = new RegExp(`<row r="${start}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)`);
  if (!pattern.test(xml)) throw new Error(`No se encontró la fila ${start} en la hoja.`);
  return xml.replace(pattern, generated);
}

function emptyRow(row: number, template: RowTemplate): string {
  const cells = [...template.styles.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([column, style]) => `<c r="${columnLetter(column)}${row}" s="${style}"/>`)
    .join("");
  return `<row r="${row}"${template.attrs.replace(/\sr="\d+"/, "")}>${cells}</row>`;
}

function buildRow(row: number, firstColumn: number, values: CellValue[], template: RowTemplate): string {
  // Se recorre el ancho COMPLETO de la fila molde, no solo las columnas con
  // dato: una celda omitida pierde su estilo y parte la tabla visualmente.
  const columns = [...template.styles.keys()].sort((left, right) => left - right);
  const cells = columns
    .map((column) => {
      const style = template.styles.get(column)!;
      const address = `${columnLetter(column)}${row}`;
      const value = values[column - firstColumn];
      if (value === null || value === undefined || value === "") return `<c r="${address}" s="${style}"/>`;
      if (value instanceof Date) return `<c r="${address}" s="${style}"><v>${toExcelSerial(value)}</v></c>`;
      if (typeof value === "number") return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
      // Cadena en línea: evita tocar sharedStrings.xml, que obligaría a
      // reindexar todas las referencias del libro.
      return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
    })
    .join("");
  return `<row r="${row}"${template.attrs.replace(/\sr="\d+"/, "")}>${cells}</row>`;
}

/** Escribe una celda suelta conservando su estilo. */
export function writeCell(xml: string, address: string, value: CellValue): string {
  const pattern = new RegExp(`<c r="${address}"([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)`);
  const match = xml.match(pattern);
  if (!match) return xml;
  const style = match[1].match(/\ss="(\d+)"/)?.[0] ?? "";
  if (value === null || value === undefined || value === "") return xml.replace(pattern, `<c r="${address}"${style}/>`);
  if (value instanceof Date) return xml.replace(pattern, `<c r="${address}"${style}><v>${toExcelSerial(value)}</v></c>`);
  if (typeof value === "number") return xml.replace(pattern, `<c r="${address}"${style}><v>${value}</v></c>`);
  return xml.replace(
    pattern,
    `<c r="${address}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
  );
}

/** Ajusta el rango de una tabla al número de filas escritas. */
export function setTableRows(xml: string, lastRow: number): string {
  const ref = xml.match(/ ref="([A-Z]+)(\d+):([A-Z]+)\d+"/);
  if (!ref) return xml;
  // Una tabla de Excel exige al menos una fila de datos bajo el encabezado.
  const end = Math.max(lastRow, Number(ref[2]) + 1);
  const next = `${ref[1]}${ref[2]}:${ref[3]}${end}`;
  return xml.replace(/ ref="[^"]+"/, ` ref="${next}"`).replace(/<autoFilter ref="[^"]+"/, `<autoFilter ref="${next}"`);
}

/** Amplía `<dimension>` para que cubra las filas escritas. */
export function setDimension(xml: string, lastRow: number): string {
  return xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/, (match, c1, r1, c2, r2) => {
    const end = Math.max(Number(r2), lastRow);
    void match;
    return `<dimension ref="${c1}${r1}:${c2}${end}"/>`;
  });
}

/**
 * Marca el libro para que Excel recalcule TODO al abrirlo.
 *
 * Es lo que permite no escribir un solo total: las `SUM(Tabla1[Piezas])`, los
 * `COUNT` y el `VLOOKUP` de la sucursal siguen siendo las fórmulas originales y
 * se resuelven solas con los datos nuevos.
 */
export function forceRecalcOnLoad(xml: string): string {
  if (/<calcPr[^>]*\/>/.test(xml)) {
    return xml.replace(/<calcPr([^>]*?)\/>/, (match, attrs: string) => {
      void match;
      const cleaned = attrs.replace(/\sfullCalcOnLoad="[^"]*"/g, "");
      return `<calcPr${cleaned} fullCalcOnLoad="1"/>`;
    });
  }
  return xml.replace("</workbook>", '<calcPr calcId="191028" fullCalcOnLoad="1"/></workbook>');
}
