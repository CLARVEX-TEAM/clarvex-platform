import assert from "node:assert/strict";
import test from "node:test";
import { buildScanPdf } from "../lib/scan-pdf";

// PNG 1×1 transparente (válido, para que pdf-lib lo pueda incrustar).
const PNG_1x1 = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
));

function imageCount(pdf: Uint8Array): number {
  return (new TextDecoder("latin1").decode(pdf).match(/\/Subtype \/Image/g) ?? []).length;
}

test("arma un PDF válido con una imagen incrustada por página", async () => {
  const pdf = await buildScanPdf([PNG_1x1, PNG_1x1, PNG_1x1]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.equal(text.slice(0, 4), "%PDF");       // empieza como PDF
  assert.match(text, /%%EOF\s*$/);              // termina bien
  assert.equal(imageCount(pdf), 3);             // una imagen por hoja escaneada
});

test("un PDF de una sola página también sale bien", async () => {
  const pdf = await buildScanPdf([PNG_1x1]);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 4)), "%PDF");
  assert.equal(imageCount(pdf), 1);
});
