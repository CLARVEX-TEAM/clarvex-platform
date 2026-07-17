/**
 * Enderezado por perspectiva: dadas las 4 esquinas del documento en la foto, lo
 * "endereza" a un rectángulo — el recorte tipo CamScanner. Es la parte matemática
 * (homografía), separada de la UI para poder probarla.
 *
 * Se computa la homografía que mapea el rectángulo DESTINO → las 4 esquinas
 * ORIGEN, y para cada píxel del destino se muestrea el origen (mapeo inverso).
 */

export type Point = { x: number; y: number };

/** Resuelve un sistema lineal n×n por eliminación gaussiana con pivoteo. */
function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col] || 1e-12;
    for (let c = col; c <= n; c += 1) a[col][c] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = a[r][col];
      for (let c = col; c <= n; c += 1) a[r][c] -= factor * a[col][c];
    }
  }
  return a.map((row) => row[n]);
}

/**
 * Homografía 3×3 (h33 = 1) que mapea los puntos `from` a los puntos `to`.
 * Requiere 4 correspondencias.
 */
export function homography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Aplica una homografía a un punto. */
export function applyHomography(h: number[], x: number, y: number): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Tamaño del rectángulo destino a partir de las esquinas del documento (en orden
 * TL, TR, BR, BL): promedio de lados opuestos, acotado para no reventar memoria.
 */
export function outputSize(corners: Point[], maxSide = 1600): { width: number; height: number } {
  const [tl, tr, br, bl] = corners;
  const width = (dist(tl, tr) + dist(bl, br)) / 2;
  const height = (dist(tl, bl) + dist(tr, br)) / 2;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Endereza el documento a un rectángulo. `corners` en orden TL, TR, BR, BL, en
 * coordenadas de `source`. Devuelve un ImageData del documento recto.
 */
export function warpDocument(source: ImageData, corners: Point[]): ImageData {
  const { width, height } = outputSize(corners);
  const dstCorners: Point[] = [
    { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }
  ];
  // DESTINO → ORIGEN (mapeo inverso, para muestrear).
  const h = homography(dstCorners, corners);

  const out = new Uint8ClampedArray(width * height * 4);
  const sw = source.width;
  const sh = source.height;
  const src = source.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = applyHomography(h, x + 0.5, y + 0.5);
      const di = (y * width + x) * 4;
      // Muestreo bilineal.
      if (p.x < 0 || p.y < 0 || p.x >= sw - 1 || p.y >= sh - 1) {
        out[di] = out[di + 1] = out[di + 2] = 255; out[di + 3] = 255; // fuera → blanco
        continue;
      }
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
      const fx = p.x - x0, fy = p.y - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c += 1) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        out[di + c] = top * (1 - fy) + bottom * fy;
      }
      out[di + 3] = 255;
    }
  }
  return new ImageData(out, width, height);
}
