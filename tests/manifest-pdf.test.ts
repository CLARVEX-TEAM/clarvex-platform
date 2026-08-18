import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { extractTextItems, parseManifest } from "../lib/manifest-pdf";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name));
const read = (name: string) => parseManifest(extractTextItems(fixture(name)));

/* ─── Manifiestos reales de TH SAN AGUSTIN ───────────────────────────────── */

test("lee un manifiesto de una sola caja", () => {
  const outcome = read("manifiesto-591464.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.declaredBoxes, 1);
  assert.equal(outcome.value.declaredPieces, 2);
  assert.deepEqual(outcome.value.boxes, [{ delivery: "81871256", box: "K23279926", pieces: 2 }]);
});

test("lee un manifiesto de 22 cajas y 671 piezas", () => {
  const outcome = read("manifiesto-591299.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.boxes.length, 22);
  assert.equal(outcome.value.boxes.reduce((total, box) => total + box.pieces, 0), 671);
});

test("NO cuenta dos veces las paginas duplicadas del PDF", () => {
  // Cada pagina viene por duplicado (original y copia para firmas). Sin quitar
  // el duplicado serian 44 cajas y 1342 piezas: el inventario al doble, en
  // silencio. Es el fallo mas caro que puede tener este lector.
  const outcome = read("manifiesto-591299.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.boxes.length, 22, "22, no 44");
  assert.equal(outcome.value.declaredBoxes, 22);
});

test("le quita los ceros de la izquierda a la entrega", () => {
  const outcome = read("manifiesto-591299.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.boxes[0].delivery, "81863988");
  assert.ok(outcome.value.boxes.every((box) => !box.delivery.startsWith("0")));
});

test("72.000 son 72 piezas, no 72 mil", () => {
  // El formato SAP trae siempre tres decimales. Leerlo como separador de miles
  // multiplicaria el inventario por mil.
  const outcome = read("manifiesto-591299.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.ok(outcome.value.boxes.every((box) => box.pieces < 1000));
});

test("una misma entrega puede venir en varias cajas", () => {
  const outcome = read("manifiesto-591299.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const catorce = outcome.value.boxes.filter((box) => box.delivery === "81874843");
  assert.equal(catorce.length, 14);
  // Las cajas si son unicas: es lo que distingue un renglon de otro.
  assert.equal(new Set(catorce.map((box) => box.box)).size, 14);
});

test("saca el manifiesto, el transporte y el destinatario", () => {
  const outcome = read("manifiesto-591299.pdf");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.manifest, "M0030014300693");
  assert.equal(outcome.value.transportSap, "591299");
  assert.match(outcome.value.destination ?? "", /SAN AGUSTIN/);
  assert.equal(outcome.value.checkOut, "10.08.2026/22:41:00");
});

test("el pedido comercial puede ser un numero o MULTIPEDIDO", () => {
  const uno = read("manifiesto-591464.pdf");
  const otro = read("manifiesto-591299.pdf");
  assert.equal(uno.ok && uno.value.commercialOrder, "4902144152");
  assert.equal(otro.ok && otro.value.commercialOrder, "MULTIPEDIDO");
});

/* ─── Lo que NO debe pasar ───────────────────────────────────────────────── */

const items = (rows: Array<[number, number, string]>) =>
  rows.map(([x, y, text]) => ({ page: 0, x, y, text }));

const tabla = (rows: Array<[string, string, string]>, cajas: number, piezas: number) => {
  const out: Array<[number, number, string]> = [
    [15.6, 539.5, "Entrega de Salida"],
    [185.7, 539.5, "Caja (HU)"],
    [360.3, 539.5, "Cantidad Pza"]
  ];
  let y = 524.5;
  for (const [delivery, box, quantity] of rows) {
    out.push([15.6, y, delivery], [185.7, y, box], [360.3, y, quantity]);
    y -= 15;
  }
  out.push([15.6, y, "Num.Cajas:"], [100, y, String(cajas)], [200, y, "Cant.Total:"], [300, y, String(piezas)]);
  return items(out);
};

test("si la suma no cuadra con Cant.Total, NO devuelve nada", () => {
  // Es la red que atrapa cualquier lectura mala. Preferimos no capturar a
  // capturar piezas fantasma: el error solo se veria en el conteo fisico.
  const outcome = parseManifest(tabla([["0081871303", "K23277660", "5.000"]], 1, 9));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /suman 5.*declara 9/);
});

test("si el numero de cajas no cuadra, NO devuelve nada", () => {
  const outcome = parseManifest(tabla([["0081871303", "K23277660", "5.000"]], 3, 5));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /1 cajas.*declara 3/);
});

test("una caja repetida se rechaza", () => {
  const outcome = parseManifest(
    tabla([["0081871303", "K23277660", "5.000"], ["0081871303", "K23277660", "5.000"]], 2, 10)
  );
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /K23277660 aparece dos veces/);
});

test("sin Num.Cajas ni Cant.Total no hay con que verificar, asi que se rechaza", () => {
  const sinTotales = items([
    [15.6, 524.5, "0081871303"],
    [185.7, 524.5, "K23277660"],
    [360.3, 524.5, "5.000"]
  ]);
  const outcome = parseManifest(sinTotales);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /verificar/);
});

test("una cantidad con decimales de verdad se ignora", () => {
  // No existen medias piezas: si aparecen decimales, algo se leyo mal.
  const outcome = parseManifest(tabla([["0081871303", "K23277660", "5.500"]], 1, 5));
  assert.equal(outcome.ok, false);
});

test("un PDF sin texto lo dice claro", () => {
  const outcome = parseManifest([]);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /escaneo|imagen/);
});
