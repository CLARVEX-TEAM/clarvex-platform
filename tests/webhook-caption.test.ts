import test from "node:test";
import assert from "node:assert/strict";
import { checklistScanCaption, evidenceCaption, inventoryCaption } from "../lib/webhook-caption";

// 2026-07-14 15:30 UTC = 09:30 en Monterrey (UTC−6, sin horario de verano).
const AT = new Date("2026-07-14T15:30:00.000Z");

test("la evidencia dice quién, de qué y cuándo", () => {
  const caption = evidenceCaption({
    storeName: "San Agustín",
    uploaderName: "JAZMIN GARCIA",
    employeeNumber: "10432",
    resourceKind: "pending",
    resourceTitle: "Acomodo de vitrina",
    note: null,
    createdAt: AT
  });
  assert.match(caption, /San Agustín/);
  assert.match(caption, /JAZMIN GARCIA \(10432\)/);
  assert.match(caption, /Pendiente: Acomodo de vitrina/);
});

test("la hora es la de Monterrey, no la del servidor (UTC)", () => {
  const caption = evidenceCaption({
    storeName: "San Agustín",
    uploaderName: "ADRIAN",
    employeeNumber: "1",
    resourceKind: "task",
    resourceTitle: "Limpieza",
    note: null,
    createdAt: AT
  });
  // Si se colara la hora del servidor diría 15:30. Debe decir 9:30.
  assert.match(caption, /9:30/);
  assert.doesNotMatch(caption, /15:30/);
});

test("la nota se incluye solo si existe", () => {
  const base = {
    storeName: "San Agustín",
    uploaderName: "ADRIAN",
    employeeNumber: "1",
    resourceKind: "logEntry",
    resourceTitle: "Cierre",
    createdAt: AT
  };
  assert.doesNotMatch(evidenceCaption({ ...base, note: null }), /📝/);
  assert.match(evidenceCaption({ ...base, note: "Faltó firma" }), /📝 Faltó firma/);
});

test("un tipo de recurso desconocido no rompe el mensaje", () => {
  const caption = evidenceCaption({
    storeName: "San Agustín",
    uploaderName: "ADRIAN",
    employeeNumber: "1",
    resourceKind: "algoNuevo",
    resourceTitle: "Título",
    note: null,
    createdAt: AT
  });
  assert.match(caption, /Evidencia: Título/);
});

test("el caption se recorta al límite de Telegram", () => {
  const caption = evidenceCaption({
    storeName: "San Agustín",
    uploaderName: "ADRIAN",
    employeeNumber: "1",
    resourceKind: "pending",
    resourceTitle: "T".repeat(900),
    note: "N".repeat(900),
    createdAt: AT
  });
  // Telegram corta en 1024; el nuestro nunca debe llegar ahí.
  assert.ok(caption.length <= 1000, `caption de ${caption.length} caracteres`);
  assert.ok(caption.endsWith("…"));
});

test("el faltante identifica producto y categoría", () => {
  const caption = inventoryCaption({
    storeName: "San Agustín",
    reporterName: "ALONSO RUIZ",
    employeeNumber: "10877",
    productName: "Bolsa Marina Negra",
    category: "Bolsas",
    note: "Solo queda exhibición",
    createdAt: AT
  });
  assert.match(caption, /📦 Faltante · San Agustín/);
  assert.match(caption, /ALONSO RUIZ \(10877\)/);
  assert.match(caption, /🏷️ Bolsa Marina Negra/);
  assert.match(caption, /📂 Bolsas/);
  assert.match(caption, /📝 Solo queda exhibición/);
});

test("el escaneo de cierre identifica el documento", () => {
  const caption = checklistScanCaption({
    storeName: "San Agustín",
    uploaderName: "JESUS ADRIAN",
    employeeNumber: "102259",
    document: "Corte de caja",
    createdAt: AT
  });
  assert.match(caption, /🧾 Cierre · Corte de caja · San Agustín/);
  assert.match(caption, /JESUS ADRIAN \(102259\)/);
  assert.match(caption, /9:30/); // hora de Monterrey
});
