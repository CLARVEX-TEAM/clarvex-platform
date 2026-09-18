import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **El MISMO comunicado se leía bien en la computadora y mal en el teléfono.**
 * Los del corporativo vienen con estructura --una línea de vigencia, la lista de
 * descuentos, la de lo que no participa-- y en el móvil se colapsaba todo en un
 * muro de texto. El escritorio ya usaba `whitespace-pre-line`; la tarjeta del
 * teléfono no usaba ninguna.
 *
 * Es el peor tipo de fallo visual: no da error, el texto ESTÁ completo, y quien
 * lo publica lo revisa desde la computadora —donde se ve bien— mientras el
 * equipo lo lee en el teléfono. Reportado el 18 de septiembre de 2026 con una
 * promoción de vigencia de tres días.
 */

/** Quita comentarios: si no, la prueba se tropieza con la PROSA que los explica. */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** `pre-line` y `pre-wrap` conservan los saltos; lo demás los colapsa. */
const CONSERVA_SALTOS = /whitespace-pre-(line|wrap)/;

test("la tarjeta del telefono conserva los saltos de linea del comunicado", () => {
  const fuente = sinComentarios(readFileSync("components/ui/NotificationCard.tsx", "utf8"));
  const parrafo = fuente.split("\n").find((l) => l.includes("{body}"));
  assert.ok(parrafo, "no encontré dónde se pinta el cuerpo");
  assert.match(parrafo, CONSERVA_SALTOS, "sin esto el comunicado se lee como un muro");
  assert.match(parrafo, /break-words/, "los códigos largos sin espacios se salen en 412 px");
});

test("el escritorio y el telefono pintan el MISMO texto igual", () => {
  /*
   * Es el invariante que importa: mismo comunicado, misma base de datos, dos
   * pantallas. Que una respete la estructura y la otra no es lo que hizo que
   * quien publica no se enterara —él lo revisa desde la computadora—.
   */
  const escritorio = sinComentarios(readFileSync("app/escritorio/comunicados/page.tsx", "utf8"));
  const deEscritorio = escritorio.split("\n").find((l) => l.includes("{item.body}"));
  assert.ok(deEscritorio, "no encontré el cuerpo en el escritorio");
  assert.match(deEscritorio, CONSERVA_SALTOS, "el escritorio también tiene que conservarlos");
});

test("los avisos sueltos siguen el mismo criterio", () => {
  const fuente = sinComentarios(readFileSync("app/notificaciones/page.tsx", "utf8"));
  const parrafo = fuente.split("\n").find((l) => l.includes("{item.body}"));
  assert.ok(parrafo, "no encontré el cuerpo del aviso");
  assert.match(parrafo, CONSERVA_SALTOS);
});
