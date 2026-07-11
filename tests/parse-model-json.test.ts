import assert from "node:assert/strict";
import test from "node:test";
import { isJsonGenerationFailure, parseModelJson } from "../lib/ai/parse-model-json";

test("parseModelJson lee JSON puro", () => {
  const data = parseModelJson<{ title: string }>('{"title":"Hola"}');
  assert.equal(data.title, "Hola");
});

test("parseModelJson extrae bloque markdown", () => {
  const data = parseModelJson<{ a: number }>("```json\n{\"a\":1}\n```");
  assert.equal(data.a, 1);
});

test("isJsonGenerationFailure detecta error de Groq", () => {
  assert.equal(isJsonGenerationFailure("Failed to generate JSON. See 'failed_generation'."), true);
  assert.equal(isJsonGenerationFailure("timeout"), false);
});
