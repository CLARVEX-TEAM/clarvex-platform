import assert from "node:assert/strict";
import test from "node:test";
import { applyHomography, homography, outputSize } from "../lib/doc-warp";

test("la homografía mapea las 4 esquinas exactamente", () => {
  const from = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const to = [{ x: 10, y: 20 }, { x: 110, y: 25 }, { x: 100, y: 220 }, { x: 5, y: 210 }];
  const h = homography(from, to);
  for (let i = 0; i < 4; i += 1) {
    const p = applyHomography(h, from[i].x, from[i].y);
    assert.ok(Math.abs(p.x - to[i].x) < 1e-6, `x[${i}] = ${p.x} ≠ ${to[i].x}`);
    assert.ok(Math.abs(p.y - to[i].y) < 1e-6, `y[${i}] = ${p.y} ≠ ${to[i].y}`);
  }
});

test("outputSize promedia los lados opuestos del documento", () => {
  // Un rectángulo perfecto de 200×100.
  const size = outputSize([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]);
  assert.equal(size.width, 200);
  assert.equal(size.height, 100);
});

test("outputSize acota el lado mayor", () => {
  const size = outputSize([{ x: 0, y: 0 }, { x: 6400, y: 0 }, { x: 6400, y: 3200 }, { x: 0, y: 3200 }], 1600);
  assert.equal(size.width, 1600);
  assert.equal(size.height, 800);
});
