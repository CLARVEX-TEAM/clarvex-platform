import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DEMO_HINT_COOKIE, hayPistaDeDemo } from "../lib/demo";

/*
 * El DEMO público no podía entrar al ESCRITORIO.
 *
 * ⚠️ El candado de escritorio pide número de empleado y PIN. Quien llega desde
 * clarvex.tech y pulsa «Explorar como Gerente» no tiene ninguno de los dos, así
 * que en computadora el demo moría en «¿Quién eres?» con cero perfiles y un
 * botón para crear uno que no podía usar. En celular funcionaba perfecto, y por
 * eso no se había visto: se descubre con una laptop, que es justo con lo que
 * evalúa software la mayoría de la gente.
 *
 * ⚠️ Los perfiles viven en `localStorage`, NO en la base: son del equipo, estilo
 * Netflix. O sea que no había nada que sembrar en producción; había que dejar
 * pasar al demo.
 *
 * La pista es una cookie legible por el navegador porque el candado se pinta
 * SIN tocar la red a propósito. Pero la cookie no decide nada: quien autoriza es
 * el servidor. Eso es lo que fija la última prueba, y es la que importa.
 */

const RAIZ = join(__dirname, "..");

function conCookie<T>(valor: string, fn: () => T): T {
  const previo = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { cookie: valor };
  try {
    return fn();
  } finally {
    if (previo === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = previo;
  }
}

test("la pista se reconoce cuando está puesta", () => {
  assert.equal(conCookie(`${DEMO_HINT_COOKIE}=1`, hayPistaDeDemo), true);
  assert.equal(conCookie(`otra=x; ${DEMO_HINT_COOKIE}=1; mas=y`, hayPistaDeDemo), true);
});

test("sin pista no se pregunta nada", () => {
  assert.equal(conCookie("", hayPistaDeDemo), false);
  assert.equal(conCookie("sesion=abc; tema=oscuro", hayPistaDeDemo), false);
});

test("⚠️ una cookie PARECIDA no cuenta", () => {
  // `clarvex_demotienda=1` empieza igual. Comparando por prefijo suelto, el
  // escritorio de una tienda real se pondría a preguntar por su sesión en cada
  // pestaña nueva, que es justo lo que esta pista viene a evitar.
  assert.equal(conCookie(`${DEMO_HINT_COOKIE}tienda=1`, hayPistaDeDemo), false);
  assert.equal(conCookie(`${DEMO_HINT_COOKIE}=0`, hayPistaDeDemo), false);
});

test("⚠️ en el servidor no existe `document` y no revienta", () => {
  const previo = (globalThis as { document?: unknown }).document;
  delete (globalThis as { document?: unknown }).document;
  try {
    assert.equal(hayPistaDeDemo(), false);
  } finally {
    if (previo !== undefined) (globalThis as { document?: unknown }).document = previo;
  }
});

test("la entrada del demo deja la pista", () => {
  const ruta = readFileSync(join(RAIZ, "app", "api", "demo", "[role]", "route.ts"), "utf8");
  assert.match(ruta, /DEMO_HINT_COOKIE/, "la ruta del demo tiene que poner la pista");
  assert.match(ruta, /httpOnly:\s*false/, "sin httpOnly: existe para leerse desde el navegador");
});

test("⚠️ el escritorio se abre por la SESIÓN, nunca por la cookie", () => {
  /*
   * Esta es la prueba que de verdad importa. La cookie no es una credencial: si
   * alguien la pone a mano en el navegador de una tienda real, el escritorio NO
   * puede abrirse. Lo único que autoriza es que `/api/auth/session` conteste
   * `demo: true`.
   *
   * Falla a propósito si alguien quita la confirmación para «ahorrarse una
   * petición»: ese atajo convierte una pista en una llave.
   */
  const shell = readFileSync(join(RAIZ, "components", "desktop", "DesktopShell.tsx"), "utf8");
  const i = shell.indexOf("hayPistaDeDemo()");
  assert.ok(i > 0, "DesktopShell debe consultar la pista");

  const rama = shell.slice(i, i + 900);
  assert.match(rama, /getSession\(\)/, "la pista tiene que confirmarse contra el servidor");
  assert.match(rama, /session\?\.demo/, "solo se abre si el SERVIDOR dice que la sesión es demo");
  assert.match(rama, /else\s*\{\s*bloquear\(\)/, "si no es demo, se bloquea igual");
  assert.match(rama, /catch\(\(\)\s*=>\s*bloquear\(\)\)/, "un fallo de red se queda del lado seguro");
});
