import assert from "node:assert/strict";
import test from "node:test";
import {
  COUNTERPARTS,
  counterpartLabel,
  counterpartOptions,
  findCounterpart
} from "../lib/inventory-counterparts";

test("estan las 72 tiendas del catalogo mas CEDIS y Uniformes", () => {
  const tiendas = COUNTERPARTS.filter((entry) => !entry.external);
  assert.equal(tiendas.length, 72);
  assert.equal(COUNTERPARTS.length, 74);
});

test("no hay codigos repetidos", () => {
  const codes = COUNTERPARTS.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("la tienda propia esta en el catalogo", () => {
  const propia = findCounterpart("03029");
  assert.ok(propia);
  assert.equal(propia.name, "TOMMY SAN AGUSTIN MONTERREY");
});

test("CUERNAVACA son DOS tiendas distintas", () => {
  // El motivo entero de guardar el APTO: en el kardex de papel se anota
  // "CUERNAVACA" y despues no hay forma de saber a cual fue.
  const galerias = findCounterpart("03036");
  const outlet = findCounterpart("03049");
  assert.ok(galerias && outlet);
  assert.match(galerias.name, /CUERNAVACA/);
  assert.match(outlet.name, /CUERNAVACA/);
  assert.notEqual(galerias.code, outlet.code);
});

test("METEPEC tambien esta duplicado", () => {
  assert.match(findCounterpart("03031")?.name ?? "", /METEPEC/);
  assert.match(findCounterpart("03073")?.name ?? "", /METEPEC/);
});

test("un codigo desconocido no resuelve", () => {
  assert.equal(findCounterpart("03999"), null);
  assert.equal(findCounterpart(""), null);
});

test("el codigo se busca sin importar espacios ni minusculas", () => {
  assert.equal(findCounterpart(" cedis ")?.code, "CEDIS");
});

test("la etiqueta usa el nombre corto que ya escriben en tienda", () => {
  // Quien captura busca "O. MTY", no "TOMMY OUTLET MONTERREY".
  assert.equal(counterpartLabel(findCounterpart("03009")!), "O. MTY");
  assert.equal(counterpartLabel(findCounterpart("03047")!), "VALLARTA");
  // Sin alias se cae al nombre oficial.
  assert.equal(counterpartLabel(findCounterpart("03025")!), "TOMMY SANTA FE");
});

test("los habituales salen primero en el desplegable", () => {
  // 71 de 129 envios de la 1ra ronda fueron a CEDIS y 54 a O. MTY: enterrarlos
  // en orden alfabetico haria mas lenta justo la captura mas repetida.
  const options = counterpartOptions();
  assert.equal(options.length, 74);
  assert.deepEqual(options.slice(0, 2).map((entry) => entry.code), ["CEDIS", "03009"]);
});

test("el resto va ordenado por codigo", () => {
  const rest = counterpartOptions().slice(2).map((entry) => entry.code);
  assert.deepEqual(rest, [...rest].sort((left, right) => left.localeCompare(right)));
});

test("cada opcion trae etiqueta lista para mostrar", () => {
  for (const option of counterpartOptions()) {
    assert.ok(option.label.length > 0, `${option.code} sin etiqueta`);
  }
});
