import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/*
 * El reporte del finde sale a las 3, 6 y 9:05 pm. El crontab llama con
 * `hora=15|18|21`; si la ruta no acepta una, ese envío responde 400 y no sale
 * nada, sin que nadie lo note. Esto mira la fuente: no hay frontera que simular.
 */
const fuente = readFileSync(path.join(__dirname, "..", "app", "api", "cron", "wa-reporte-finde", "route.ts"), "utf8");

test("la ruta acepta las tres horas del crontab", () => {
  assert.match(fuente, /new Set\(\["15", "18", "21"\]\)/);
});

test("la etiqueta sale de la hora (15 → 3 pm, 21 → 9 pm), no de un ternario de dos casos", () => {
  assert.match(fuente, /\$\{Number\(hora\) - 12\} pm/);
  assert.equal(/hora === "15" \? "3" : "6"/.test(fuente), false);
});
