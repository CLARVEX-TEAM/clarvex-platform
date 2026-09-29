import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Ninguna pantalla del teléfono usa un `<select>` nativo.
 *
 * ⚠️ No es una regla de estilo. En Android un `<select>` abre la rueda del
 * sistema: su tipografía, sus colores y su alto, en medio de una pantalla que
 * la app pinta con los suyos. Se ve como otra aplicación, y es lo primero que
 * delata que esto es una web dentro de un contenedor.
 *
 * Los dos sustitutos viven en el proyecto y cada uno tiene su caso:
 *
 *   - `SelectorChips`  — pocas opciones cortas, todas a la vista, un toque.
 *   - `AppSelect`      — lista larga, nombres o fotos: hoja inferior.
 *
 * ⚠️ La prueba busca el PATRÓN, no comprueba los sitios que ya se arreglaron.
 * La primera limpieza recorrió solo `app/*​/page.tsx` de primer nivel y dio por
 * terminado el trabajo con CINCO `<select>` todavía puestos, en páginas
 * anidadas y en componentes. Por eso esto recorre el árbol entero y falla
 * NOMBRANDO el archivo: es la tercera vez que este proyecto aprende que la
 * pregunta no es «¿está arreglado este camino?» sino «¿queda alguno abierto?».
 */

const RAIZ = join(__dirname, "..");

/**
 * Lo que queda fuera, y por qué:
 *
 *   - `escritorio` y `components/desktop` son la web de escritorio, con ratón
 *     y sin rueda del sistema; ahí un `<select>` es lo correcto.
 *   - `conteos/marbetes/imprimir` es una hoja para IMPRIMIR --fondo blanco
 *     fijo, sin cabecera ni barra-- y no vive dentro del rediseño del teléfono.
 *   - `horarios/HorariosWeb.tsx` es Horarios FUERA de la APK, tal como era
 *     antes del rediseño; dentro de la APK se pinta `page.tsx`, que no lo usa.
 */
const FUERA = [
  join("app", "escritorio"),
  join("components", "desktop"),
  join("app", "conteos", "marbetes", "imprimir"),
  join("app", "horarios", "HorariosWeb.tsx")
];

function pantallas(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...pantallas(ruta));
    } else if (ruta.endsWith(".tsx")) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Un `<select` dentro de un comentario no es un selector: varias pantallas
 * explican en su comentario qué había antes y por qué se fue. Se quitan los
 * bloques `/* … *​/` y las líneas `//` antes de buscar.
 */
export function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("ninguna pantalla del telefono usa un <select> nativo", () => {
  const culpables: string[] = [];

  for (const carpeta of ["app", "components"]) {
    for (const ruta of pantallas(join(RAIZ, carpeta))) {
      const relativa = relative(RAIZ, ruta);
      if (FUERA.some((fuera) => relativa.startsWith(fuera))) continue;
      if (/<select[\s>]/.test(sinComentarios(readFileSync(ruta, "utf8")))) {
        culpables.push(relativa.split(sep).join("/"));
      }
    }
  }

  assert.deepEqual(
    culpables,
    [],
    `Estas pantallas usan un <select> nativo, que en Android abre la rueda del ` +
      `sistema: ${culpables.join(", ")}. Cambialo por <SelectorChips> si son ` +
      `pocas opciones cortas, o por <AppSelect> si es una lista larga o con fotos.`
  );
});

test("la prueba no confunde un <select> nombrado en un comentario", () => {
  // Sin esto, cualquier pantalla que EXPLIQUE por que retiro su `<select>`
  // haria fallar la prueba, y el arreglo se leeria como el fallo.
  assert.equal(sinComentarios("/* antes habia un <select> aqui */").includes("<select"), false);
  assert.equal(sinComentarios("  // era un <select> nativo").includes("<select"), false);
  assert.equal(sinComentarios('<select value={x}>').includes("<select"), true);
});
