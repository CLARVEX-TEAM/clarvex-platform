import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Ningún elemento se pinta con el relleno y la letra del MISMO color.
 *
 * ⚠️ Es un fallo que no da error. El elemento existe, ocupa su sitio, responde
 * al toque y el icono se dibuja --hereda `currentColor`, así que también
 * desaparece--. Lo único que falta es lo que había que leer. En pantalla es una
 * pastilla de color liso, y se reporta como «los botones no tienen texto».
 *
 * Salió de verdad el 28 de septiembre de 2026 en la mesa de control de Conteos:
 * la conversión de colores del rediseño se comió la opacidad de cinco clases y
 * `bg-mint/15 text-mint` --un velo con letra verde-- quedó en `bg-mint
 * text-mint`, verde sobre verde. Ni TypeScript ni ESLint ni Tailwind dicen nada:
 * las dos clases son válidas por separado.
 *
 * ⚠️ Lo que se busca es el PATRÓN, no los cinco sitios que se arreglaron. Esa
 * misma conversión tocó todo el árbol, así que la pregunta no es «¿está
 * arreglado este botón?» sino «¿queda alguno así?».
 */

const RAIZ = join(__dirname, "..");

/**
 * Los colores de la superficie. `line` queda fuera a propósito: es un color de
 * borde y nadie escribe texto con él, así que incluirlo solo añadiría ruido.
 */
const COLORES = [
  "volt", "mint", "ember", "orchid", "sky", "purple",
  "ink", "card", "panel", "muted"
];

/**
 * ⚠️ El hueco entre las dos clases NO puede cruzar una comilla.
 *
 * En un `className` con ternario las dos ramas viven en el mismo atributo:
 *
 *     `${guardado ? "bg-mint text-white" : "bg-volt text-white"}`
 *
 * Sin ese límite, el `bg-mint` de una rama se emparejaría con un `text-mint` de
 * la otra y la prueba acusaría a un archivo sano. Cada rama es su propia cadena.
 */
export function coloresInvisibles(fuente: string): string[] {
  const hallazgos: string[] = [];
  for (const color of COLORES) {
    // `bg-mint/15` lleva opacidad: es un velo, y la letra encima se lee.
    const patron = new RegExp(`\\bbg-${color}(?![\\w/-])[^"'\`]{0,80}?\\btext-${color}(?![\\w/-])`, "g");
    if (patron.test(fuente)) hallazgos.push(color);
  }
  return hallazgos;
}

function pantallas(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...pantallas(ruta));
    else if (ruta.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

test("ningun elemento tiene la letra del color de su relleno", () => {
  const culpables: string[] = [];

  for (const carpeta of ["app", "components"]) {
    for (const ruta of pantallas(join(RAIZ, carpeta))) {
      const colores = coloresInvisibles(readFileSync(ruta, "utf8"));
      if (colores.length) {
        culpables.push(`${relative(RAIZ, ruta).split(sep).join("/")} (${colores.join(", ")})`);
      }
    }
  }

  assert.deepEqual(
    culpables,
    [],
    `Aqui el relleno y la letra son del mismo color, asi que el texto y los ` +
      `iconos no se ven: ${culpables.join(" · ")}. Si querias un velo con la ` +
      `letra encima le falta la opacidad (bg-mint/12 text-mint); si querias el ` +
      `relleno solido, la letra va en text-white.`
  );
});

test("la deteccion reconoce el fallo real y no acusa a lo sano", () => {
  // Las cinco clases exactas que se publicaron rotas, para que esta prueba
  // siga en rojo contra el codigo que las tenia.
  assert.deepEqual(coloresInvisibles('className="rounded-2xl bg-mint text-mint"'), ["mint"]);
  assert.deepEqual(coloresInvisibles('className="rounded-full bg-orchid text-orchid"'), ["orchid"]);
  assert.deepEqual(
    coloresInvisibles('className="gap-1.5 rounded-full bg-volt px-3 py-2 text-xs font-semibold text-volt"'),
    ["volt"]
  );

  // Un velo con la letra encima es correcto y es como se pinta media app.
  assert.deepEqual(coloresInvisibles('className="bg-mint/12 text-mint"'), []);
  assert.deepEqual(coloresInvisibles('className="bg-volt/10 px-2 text-volt"'), []);
  // Relleno solido con letra blanca: la accion principal.
  assert.deepEqual(coloresInvisibles('className="bg-volt text-white"'), []);
  // Contorno del color sobre la tarjeta: no es relleno.
  assert.deepEqual(coloresInvisibles('className="border border-volt/35 bg-card text-volt"'), []);

  // ⚠️ Las dos ramas de un ternario son cadenas distintas y no se cruzan.
  assert.deepEqual(
    coloresInvisibles('className={`px-4 ${ok ? "bg-mint text-white" : "bg-volt text-mint"}`}'),
    []
  );
});
