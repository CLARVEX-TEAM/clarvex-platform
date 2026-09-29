import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/*
 * Por qué existe esta prueba.
 *
 * El rediseño «papel» es exclusivo de la APK: `app/layout.tsx` pone
 * `data-surface="papel"` solo con el agente `ClarvexApp/`. Pero `.papel-hero`,
 * `.papel-elev` y `.papel-elev-alta` nacieron GLOBALES y el rediseño se coló en
 * la web, la PWA y el iPhone (29 de septiembre de 2026) sin un solo error.
 *
 * ⚠️ Comprueba el PATRÓN, no el arreglo: cualquier regla de `app/papel.css` que
 * no cuelgue del atributo falla nombrando su selector, incluida la que alguien
 * escriba mañana.
 */

const css = readFileSync(join(__dirname, "..", "app", "papel.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

function selectores(): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const cabeza = m[1].trim();
    if (cabeza.startsWith("@")) continue;
    for (const s of cabeza.split(",")) out.push(s.trim());
  }
  return out;
}

test("toda regla de papel.css cuelga de data-surface=papel", () => {
  const sueltos = selectores().filter((s) => !s.includes('[data-surface="papel"]'));
  assert.deepEqual(sueltos, [], `reglas que se aplican fuera de la APK: ${sueltos.join(" | ")}`);
});

test("las clases del lenguaje visual están acotadas", () => {
  const todos = selectores();
  for (const clase of [".papel-hero", ".papel-elev", ".papel-elev-alta"]) {
    assert.ok(todos.includes(`[data-surface="papel"] ${clase}`), `${clase} no está acotada`);
  }
});

test("solo-papel se oculta fuera de la APK y fuera-de-papel dentro", () => {
  const todos = selectores();
  assert.ok(todos.includes(':root:not([data-surface="papel"]) .solo-papel'));
  assert.ok(todos.includes('[data-surface="papel"] .fuera-de-papel'));
});
