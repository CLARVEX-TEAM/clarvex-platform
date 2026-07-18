import assert from "node:assert/strict";
import test from "node:test";
import { formatScanDate, scanDocumentLabel, scanPdfFileName, scanRole } from "../lib/checklist-scan";

test("scanRole clasifica por el texto del punto", () => {
  assert.equal(scanRole("Escanear vouchers de terminal"), "vouchers");
  assert.equal(scanRole("Escanear corte de caja"), "cierre");
  assert.equal(scanRole("Cierre de tienda"), "cierre");
  assert.equal(scanRole("Escanear comprobante de depósito"), "other");
});

test("formatScanDate pasa la fecha a DD-MM-YYYY", () => {
  assert.equal(formatScanDate("2026-07-18"), "18-07-2026");
  assert.equal(formatScanDate("raro"), "raro"); // ante algo inesperado, no rompe
});

test("el PDF de vouchers lleva el nombre de la tienda; el de cierre no", () => {
  assert.equal(
    scanPdfFileName("Escanear vouchers de terminal", "TH SAN AGUSTIN", "2026-07-18"),
    "VOUCHERS TH SAN AGUSTIN 18-07-2026.pdf"
  );
  assert.equal(
    scanPdfFileName("Escanear corte de caja", "TH SAN AGUSTIN", "2026-07-18"),
    "CIERRE DE TIENDA 18-07-2026.pdf"
  );
  assert.equal(
    scanPdfFileName("Escanear comprobante de depósito", "TH SAN AGUSTIN", "2026-07-18"),
    "comprobante de depósito 18-07-2026.pdf"
  );
});

test("el pie de foto usa un nombre de documento legible", () => {
  assert.equal(scanDocumentLabel("Escanear vouchers de terminal"), "Vouchers");
  assert.equal(scanDocumentLabel("Escanear corte de caja"), "Cierre de tienda");
  assert.equal(scanDocumentLabel("Escanear comprobante de depósito"), "comprobante de depósito");
});
