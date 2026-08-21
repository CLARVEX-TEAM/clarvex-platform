import assert from "node:assert/strict";
import test from "node:test";
import { stripCodeFence } from "../lib/pos-vision-bedrock";

test("quita la envoltura de bloque de codigo que pone Bedrock", () => {
  // ⚠️ Bedrock devuelve el JSON dentro de ```json, a diferencia de Gemini, que
  // lo entrega limpio por el esquema de respuesta. Sin quitarlo, el JSON.parse
  // falla SIEMPRE y la lectura se cae en el ultimo paso, con el trabajo hecho.
  assert.equal(stripCodeFence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripCodeFence('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripCodeFence('```JSON\n{"a":1}\n```'), '{"a":1}');
});

test("un JSON limpio pasa intacto", () => {
  assert.equal(stripCodeFence('{"a":1}'), '{"a":1}');
  assert.equal(stripCodeFence('  {"a":1}  '), '{"a":1}');
});

test("no destroza un JSON que contenga acentos graves", () => {
  const texto = '{"name":"CASTRO, JAZMIN"}';
  assert.equal(stripCodeFence(texto), texto);
});
