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

test("⚠️ el 03000 de la hoja de traspaso ES el CEDIS", () => {
  /*
   * La hoja imprime «Ubicación de recepción: 03000 - TOMMY» con la razón
   * «CGRAL - Devolución A. Gral.». El kardex de papel de la tienda siempre lo
   * anotó como CEDIS: mismo sitio, dos nombres. Sin la equivalencia, un
   * traspaso leído de la hoja se rechaza con «no está en el catálogo».
   */
  const encontrado = findCounterpart("03000");
  assert.ok(encontrado, "03000 no resuelve a nada");
  assert.equal(encontrado.code, "CEDIS");
});

test("la equivalencia NO agrega una fila al catálogo", () => {
  /*
   * ⚠️ Dos filas para el mismo destino partirían el histórico en dos y ninguna
   * sumaría lo que de verdad salió — y ahí va la mayor parte del movimiento.
   * El desplegable tiene que seguir enseñando CEDIS una sola vez.
   */
  const opciones = counterpartOptions();
  assert.equal(opciones.filter((o) => o.code === "CEDIS").length, 1);
  assert.equal(opciones.filter((o) => o.code === "03000").length, 0);
});

test("la equivalencia no se traga un código real", () => {
  // 03029 es la propia tienda y sigue siendo ella misma.
  assert.equal(findCounterpart("03029")?.code, "03029");
  assert.equal(findCounterpart("03009")?.code, "03009");
  assert.equal(findCounterpart("99999"), null);
});
