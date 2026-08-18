import { inflateSync } from "node:zlib";

/**
 * Lector del manifiesto de carga que llega con la mercancía.
 *
 * El PDF trae **texto de verdad**, no imagen, así que se lee exacto: nada de
 * OCR ni de adivinar dígitos. Aun así, todo lo leído se contrasta contra el
 * `Num.Cajas` y el `Cant.Total` que el propio documento declara al pie. Si no
 * cuadran, no se devuelve nada — un manifiesto mal leído mete piezas fantasma
 * al inventario y eso no se nota hasta el conteo físico.
 *
 * ⚠️ **Cada página viene DUPLICADA** dentro del archivo (original y copia para
 * firmas). Sin quitar el duplicado, un manifiesto de 22 cajas se lee como 44 y
 * el inventario se infla al doble en silencio. Es el fallo más caro que puede
 * tener este lector, así que se corta en dos sitios: se descartan las páginas
 * repetidas y, además, una caja que aparezca dos veces es error.
 */

export type ManifestBox = {
  /** Entrega de salida, ya sin los ceros de la izquierda. */
  delivery: string;
  /** Caja (HU). Es el folio que va al kardex. */
  box: string;
  pieces: number;
};

export type Manifest = {
  /** MANIFIESTO DE CARGA. Es lo que el kardex guarda como documento. */
  manifest: string | null;
  transportSap: string | null;
  destination: string | null;
  commercialOrder: string | null;
  /** Salida del CEDIS. NO es la fecha del kardex: esa es la del registro. */
  checkOut: string | null;
  boxes: ManifestBox[];
  declaredBoxes: number;
  declaredPieces: number;
};

export type ManifestResult = { ok: true; value: Manifest } | { ok: false; error: string };

type TextItem = { page: number; x: number; y: number; text: string };

/**
 * Texto del PDF con su posición. Se conserva la coordenada porque el documento
 * no tiene columnas: son celdas sueltas colocadas por X e Y, y la tabla solo
 * existe si se reagrupa por renglón.
 */
export function extractTextItems(pdf: Buffer): TextItem[] {
  const raw = pdf.toString("latin1");
  const items: TextItem[] = [];
  const streams = /stream\r?\n/g;
  let page = 0;
  let match: RegExpExecArray | null;

  while ((match = streams.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    const slice = pdf.subarray(start, end);

    let content: string;
    try {
      content = inflateSync(slice).toString("latin1");
    } catch {
      content = slice.toString("latin1");
    }
    if (!content.includes("Tj")) continue;

    const cells = /([\d.]+)\s+([\d.]+)\s+Td[^<]{0,40}<([0-9A-Fa-f]+)>\s*Tj/g;
    let cell: RegExpExecArray | null;
    let found = false;
    while ((cell = cells.exec(content)) !== null) {
      found = true;
      items.push({
        page,
        x: Number.parseFloat(cell[1]),
        y: Number.parseFloat(cell[2]),
        text: hexToText(cell[3]).trim()
      });
    }
    if (found) page += 1;
  }

  return items;
}

function hexToText(hex: string): string {
  let out = "";
  for (let index = 0; index + 1 < hex.length; index += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return out;
}

/** Renglón del documento: las celdas de una misma Y, ordenadas de izquierda a derecha. */
type Cell = { x: number; text: string };
type Line = { y: number; cells: Cell[] };

function linesOf(items: TextItem[]): Line[] {
  const byY = new Map<number, TextItem[]>();
  for (const item of items) {
    // Media unidad de tolerancia: el generador coloca la misma fila con
    // decimales que no siempre coinciden al milímetro.
    const key = Math.round(item.y * 2) / 2;
    const bucket = byY.get(key);
    if (bucket) bucket.push(item);
    else byY.set(key, [item]);
  }
  return Array.from(byY.entries())
    .map(([y, cells]) => ({
      y,
      cells: cells.sort((a, b) => a.x - b.x).map((cell) => ({ x: cell.x, text: cell.text }))
    }))
    .sort((a, b) => b.y - a.y);
}

/** Páginas sin repetir. Dos páginas con el MISMO texto son la copia de firmas. */
function uniquePages(items: TextItem[]): TextItem[][] {
  const pages = new Map<number, TextItem[]>();
  for (const item of items) {
    const bucket = pages.get(item.page);
    if (bucket) bucket.push(item);
    else pages.set(item.page, [item]);
  }

  const seen = new Set<string>();
  const out: TextItem[][] = [];
  for (const page of Array.from(pages.values())) {
    const signature = page.map((item) => `${item.x}:${item.y}:${item.text}`).join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(page);
  }
  return out;
}

const DELIVERY = /^\d{6,14}$/;
const BOX = /^[A-Z]\d{6,14}$/;
/**
 * Cantidad en formato SAP: SIEMPRE tres decimales. `72.000` son 72 piezas, no
 * 72 mil — leerlo como separador de miles multiplicaría el inventario por mil.
 */
const QUANTITY = /^(\d{1,3}(?:,\d{3})*|\d+)\.(\d{3})$/;

function parseQuantity(value: string): number | null {
  const match = QUANTITY.exec(value.trim());
  if (!match) return null;
  // Piezas fraccionarias no existen: si los decimales no son 000, algo se leyó mal.
  if (match[2] !== "000") return null;
  const whole = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(whole) && whole > 0 ? whole : null;
}

/** Valor de la celda siguiente a una etiqueta, dentro del mismo renglón. */
function after(lines: Line[], label: string): string | null {
  for (const line of lines) {
    const index = line.cells.findIndex((cell) => cell.text.startsWith(label));
    if (index >= 0 && line.cells[index + 1]) return line.cells[index + 1].text.trim();
  }
  return null;
}

/**
 * Valor colocado DEBAJO de una etiqueta.
 *
 * ⚠️ Hay que exigir que comparta COLUMNA. El encabezado mete la dirección del
 * CEDIS en renglones intercalados, así que quedarse con la primera celda de la
 * línea siguiente devolvía «Boulevard Manuel Avila Camacho» como número de
 * pedido.
 */
function below(lines: Line[], label: string): string | null {
  const index = lines.findIndex((line) => line.cells.some((cell) => cell.text.startsWith(label)));
  if (index < 0) return null;
  const anchor = lines[index].cells.find((cell) => cell.text.startsWith(label));
  if (!anchor) return null;

  for (let next = index + 1; next < lines.length && next <= index + 3; next += 1) {
    const aligned = lines[next].cells.find((cell) => Math.abs(cell.x - anchor.x) <= 6 && cell.text.trim() !== "");
    if (aligned) return aligned.text.trim();
  }
  return null;
}

export function parseManifest(items: TextItem[]): ManifestResult {
  if (items.length === 0) return { ok: false, error: "El PDF no trae texto: ¿es un escaneo o una imagen?" };

  const pages = uniquePages(items);
  const all: Line[] = [];
  for (const page of pages) all.push(...linesOf(page));

  const boxes: ManifestBox[] = [];
  let declaredBoxes: number | null = null;
  let declaredPieces: number | null = null;

  for (const line of all) {
    const totals = line.cells.findIndex((cell) => cell.text.startsWith("Num.Cajas"));
    if (totals >= 0) {
      declaredBoxes = toInteger(line.cells[totals + 1]?.text);
      const totalIndex = line.cells.findIndex((cell) => cell.text.startsWith("Cant.Total"));
      if (totalIndex >= 0) declaredPieces = toInteger(line.cells[totalIndex + 1]?.text);
      continue;
    }

    // Fila de la tabla: entrega, caja y cantidad, en ese orden.
    const cells = line.cells.map((cell) => cell.text.trim()).filter((cell) => cell !== "");
    if (cells.length < 3) continue;
    const [delivery, box, quantity] = cells;
    if (!DELIVERY.test(delivery) || !BOX.test(box)) continue;
    const pieces = parseQuantity(quantity);
    if (pieces === null) continue;

    boxes.push({
      // Los ceros de la izquierda no se usan en el kardex: 0081871303 → 81871303.
      delivery: delivery.replace(/^0+/, ""),
      box,
      pieces
    });
  }

  if (boxes.length === 0) return { ok: false, error: "No se encontró ninguna caja en el manifiesto." };
  if (declaredBoxes === null || declaredPieces === null) {
    return { ok: false, error: "El manifiesto no trae Num.Cajas y Cant.Total: sin ellos no se puede verificar la lectura." };
  }

  const repeated = boxes.map((item) => item.box).find((box, index, list) => list.indexOf(box) !== index);
  if (repeated) {
    return { ok: false, error: `La caja ${repeated} aparece dos veces. El PDF trae páginas repetidas y la lectura no es de fiar.` };
  }

  if (boxes.length !== declaredBoxes) {
    return { ok: false, error: `Se leyeron ${boxes.length} cajas y el manifiesto declara ${declaredBoxes}.` };
  }
  const sum = boxes.reduce((total, item) => total + item.pieces, 0);
  if (sum !== declaredPieces) {
    return { ok: false, error: `Las piezas leídas suman ${sum} y el manifiesto declara ${declaredPieces}.` };
  }

  return {
    ok: true,
    value: {
      manifest: below(all, "MANIFIESTO DE CARGA"),
      transportSap: below(all, "No. de Transporte SAP"),
      destination: after(all, "Destinatario"),
      commercialOrder: below(all, "Pedido Comercial"),
      checkOut: below(all, "Fecha/Hora Fin Check Out"),
      boxes,
      declaredBoxes,
      declaredPieces
    }
  };
}

function toInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[,\s]/g, ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}
