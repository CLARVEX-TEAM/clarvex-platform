import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * La ubicación de la tienda se edita desde LAS DOS pantallas de administración.
 *
 * ⚠️ Hay dos, y es fácil olvidarlo: `/admin` --la del teléfono-- y
 * `/escritorio/admin` --la del riel de iconos, que es donde se administra de
 * verdad--. El formulario de ubicación se escribió solo en la primera. El campo
 * existía, la API existía, la migración estaba aplicada y la columna en la base
 * esperando; simplemente no había forma de llegar desde donde la gente
 * administra. Se reportó como «no aparecen las coordenadas».
 *
 * Es el mismo fallo que dejó nueve pantallas sin puerta, y la misma lección que
 * este proyecto ya escribió tres veces: **la pregunta no es «¿está puesto?»
 * sino «¿se llega desde todos los caminos?»**.
 */

const RAIZ = join(__dirname, "..");

const PANTALLAS = [
  join("app", "admin", "page.tsx"),
  join("app", "escritorio", "admin", "page.tsx")
];

/**
 * Lo que hace falta para que el bloque sirva de algo. No se comprueba el texto
 * visible --que se puede reescribir-- sino las piezas sin las que no funciona:
 * los tres campos, la llamada que guarda y el campo que lee lo guardado.
 */
const PIEZAS: Array<{ patron: RegExp; falta: string }> = [
  { patron: /aria-label="Dirección de la tienda"/, falta: "el campo de dirección" },
  { patron: /aria-label="Latitud"/, falta: "el campo de latitud" },
  { patron: /aria-label="Longitud"/, falta: "el campo de longitud" },
  { patron: /\/ubicacion`,?\s*\{?\s*\n?\s*method: "PUT"/, falta: "la llamada PUT que guarda" },
  { patron: /store\.latitude/, falta: "la lectura de lo ya guardado (se abriría siempre vacío)" }
];

test("⚠️ la ubicación se edita desde LAS DOS pantallas de administración", () => {
  const culpables: string[] = [];

  for (const pantalla of PANTALLAS) {
    const fuente = readFileSync(join(RAIZ, pantalla), "utf8");
    for (const { patron, falta } of PIEZAS) {
      if (!patron.test(fuente)) {
        culpables.push(`${pantalla.split(/[\\/]/).join("/")}: falta ${falta}`);
      }
    }
  }

  assert.deepEqual(
    culpables,
    [],
    `La ubicación no se puede capturar desde alguna de las dos pantallas de ` +
      `administración: ${culpables.join(" · ")}. Hay dos, y la de escritorio es ` +
      `la que se usa: un campo que solo existe en una es un campo al que nadie llega.`
  );
});

test("⚠️ el aviso del mapa NO se mezcla con el error", () => {
  /*
   * Que OpenStreetMap no conteste no significa que la direccion no se haya
   * guardado: se guarda igual y solo se queda sin imagen. Pintandolo como error
   * pareceria que no se guardo nada, y alguien volveria a teclearlo entero
   * --o peor, daria por hecho que la tienda no tiene ubicacion--.
   */
  for (const pantalla of PANTALLAS) {
    const fuente = readFileSync(join(RAIZ, pantalla), "utf8");
    assert.match(
      fuente,
      /avisoMapa/,
      `${pantalla}: no distingue el aviso del mapa de un error de guardado`
    );
  }
});
