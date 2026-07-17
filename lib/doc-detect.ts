/**
 * Detección ligera de las 4 esquinas de un documento en la foto — para
 * PREPOSICIONAR las esquinas del escáner (el usuario las puede ajustar). No es
 * OpenCV: es una heurística de "región clara más grande" que funciona cuando el
 * papel es más claro que la superficie (el caso normal de un corte/voucher sobre
 * el mostrador). Si no hay una región clara clara, devuelve null y el escáner usa
 * el recuadro por defecto.
 */

export type Point = { x: number; y: number };

const DETECT_MAX = 360; // resolución a la que se corre la detección (rápida)

/**
 * Detecta las esquinas del documento en un ImageData. Downsamplea a ~360px para
 * ir rápido y devuelve las esquinas en coordenadas del ImageData ORIGINAL, o null.
 */
export function detectDocumentCorners(image: ImageData): Point[] | null {
  const { width, height, data } = image;
  const scale = Math.min(1, DETECT_MAX / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const i = (sy * width + sx) * 4;
      gray[y * w + x] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
  }
  const corners = detectCornersFromGray(gray, w, h);
  return corners ? corners.map((c) => ({ x: c.x / scale, y: c.y / scale })) : null;
}

/** Umbral de Otsu sobre un histograma de 256 niveles. */
function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/**
 * Encuentra las 4 esquinas del documento a partir de una imagen en grises.
 * Devuelve [TL, TR, BR, BL] en coordenadas de esa imagen, o null si no hay una
 * región clara suficientemente grande.
 */
export function detectCornersFromGray(gray: Uint8Array, width: number, height: number): Point[] | null {
  const threshold = otsu(gray);
  const bright = new Uint8Array(gray.length);
  let brightCount = 0;
  for (let i = 0; i < gray.length; i += 1) {
    if (gray[i] > threshold) { bright[i] = 1; brightCount += 1; }
  }
  // Si casi todo o casi nada es "claro", no hay documento distinguible.
  if (brightCount < gray.length * 0.05) return null;

  // Componente conexa más grande de píxeles claros (BFS iterativo).
  const label = new Int32Array(gray.length).fill(0);
  const stack: number[] = [];
  let bestSize = 0;
  let bestLabel = 0;
  let current = 0;
  for (let start = 0; start < gray.length; start += 1) {
    if (bright[start] !== 1 || label[start] !== 0) continue;
    current += 1;
    let size = 0;
    stack.push(start);
    label[start] = current;
    while (stack.length) {
      const p = stack.pop()!;
      size += 1;
      const x = p % width, y = (p / width) | 0;
      if (x > 0 && bright[p - 1] && !label[p - 1]) { label[p - 1] = current; stack.push(p - 1); }
      if (x < width - 1 && bright[p + 1] && !label[p + 1]) { label[p + 1] = current; stack.push(p + 1); }
      if (y > 0 && bright[p - width] && !label[p - width]) { label[p - width] = current; stack.push(p - width); }
      if (y < height - 1 && bright[p + width] && !label[p + width]) { label[p + width] = current; stack.push(p + width); }
    }
    if (size > bestSize) { bestSize = size; bestLabel = current; }
  }
  // La región debe ser un buen pedazo de la foto para ser el documento.
  if (bestSize < gray.length * 0.10) return null;

  // Esquinas por extremos de suma/diferencia (TL = min x+y, BR = max x+y,
  // TR = max x−y, BL = min x−y): aproximan bien un rectángulo inclinado.
  let tl = 0, br = 0, tr = 0, bl = 0;
  let tlV = Infinity, brV = -Infinity, trV = -Infinity, blV = Infinity;
  for (let p = 0; p < label.length; p += 1) {
    if (label[p] !== bestLabel) continue;
    const x = p % width, y = (p / width) | 0;
    const sum = x + y, diff = x - y;
    if (sum < tlV) { tlV = sum; tl = p; }
    if (sum > brV) { brV = sum; br = p; }
    if (diff > trV) { trV = diff; tr = p; }
    if (diff < blV) { blV = diff; bl = p; }
  }
  const toPoint = (p: number): Point => ({ x: p % width, y: (p / width) | 0 });
  const corners = [toPoint(tl), toPoint(tr), toPoint(br), toPoint(bl)];

  // Degenerado (esquinas encimadas): mejor null que un recorte absurdo.
  const area = Math.abs(
    (corners[0].x * (corners[1].y - corners[3].y)) +
    (corners[1].x * (corners[2].y - corners[0].y)) +
    (corners[2].x * (corners[3].y - corners[1].y)) +
    (corners[3].x * (corners[0].y - corners[2].y))
  ) / 2;
  if (area < gray.length * 0.10) return null;

  return corners;
}
