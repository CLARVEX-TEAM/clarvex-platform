import assert from "node:assert/strict";
import test from "node:test";
import { detectCornersFromGray } from "../lib/doc-detect";

/** Pinta un cuadrilátero claro (200) sobre fondo oscuro (30). */
function synthetic(width: number, height: number, quad: { x: number; y: number }[]): Uint8Array {
  const gray = new Uint8Array(width * height).fill(30);
  // Relleno por regla par-impar del polígono.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let inside = false;
      for (let i = 0, j = quad.length - 1; i < quad.length; j = i, i += 1) {
        const a = quad[i], b = quad[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) gray[y * width + x] = 200;
    }
  }
  return gray;
}

test("detecta las 4 esquinas de un documento inclinado", () => {
  const W = 200, H = 200;
  // Rectángulo girado (TL, TR, BR, BL).
  const quad = [{ x: 40, y: 20 }, { x: 180, y: 55 }, { x: 160, y: 175 }, { x: 20, y: 140 }];
  const corners = detectCornersFromGray(synthetic(W, H, quad), W, H);
  assert.ok(corners, "debería detectar el documento");
  // Cada esquina detectada cerca de la real (±8 px de tolerancia por el rasterizado).
  for (let i = 0; i < 4; i += 1) {
    assert.ok(Math.abs(corners![i].x - quad[i].x) <= 8, `esquina ${i} x: ${corners![i].x} vs ${quad[i].x}`);
    assert.ok(Math.abs(corners![i].y - quad[i].y) <= 8, `esquina ${i} y: ${corners![i].y} vs ${quad[i].y}`);
  }
});

test("sin región clara clara, devuelve null", () => {
  const gray = new Uint8Array(100 * 100).fill(120); // todo gris parejo
  assert.equal(detectCornersFromGray(gray, 100, 100), null);
});
