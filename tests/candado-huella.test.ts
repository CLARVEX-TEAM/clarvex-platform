import assert from "node:assert/strict";
import test from "node:test";
import { GRACIA_MS, candadoActivado, guardarCandado, hayQueVolverAPedir } from "../lib/candado-huella";

/*
 * Por qué existen estas pruebas.
 *
 * El candado tapa la app entera. Los dos fallos posibles apuntan en direcciones
 * opuestas y los dos son malos:
 *
 *   - Abrirse cuando no debe: la app queda a la vista en el telefono del
 *     mostrador, que es justo lo que vino a evitar.
 *   - Cerrarse cuando no debe: encierra a alguien fuera de su trabajo en medio
 *     del turno, y no hay forma de arreglarlo desde dentro.
 *
 * ⚠️ Lo mas delicado es la GRACIA. Tomar una foto de evidencia o de un marbete
 * SALE de la app --se abre la camara del sistema-- asi que sin margen pediria la
 * huella cada vez. La gente acabaria apagando el candado, y uno apagado protege
 * menos que uno con un minuto de holgura.
 */

const almacen = new Map<string, string>();
const original = (globalThis as { localStorage?: unknown }).localStorage;

test.beforeEach(() => {
  almacen.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k)
  };
});

test.after(() => {
  if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = original;
});

test("por defecto el candado esta APAGADO", () => {
  // ⚠️ Encenderlo por omision lo activaria en el telefono compartido de la
  // tienda, donde cualquier huella registrada abre la sesion de quien este
  // dentro. Esa decision no la puede tomar el programa.
  assert.equal(candadoActivado(), false);
});

test("se recuerda al encenderlo y al apagarlo", () => {
  guardarCandado(true);
  assert.equal(candadoActivado(), true);
  guardarCandado(false);
  assert.equal(candadoActivado(), false);
});

test("un localStorage que lanza deja el candado APAGADO, no encendido", () => {
  // ⚠️ Ante un almacenamiento roto se falla hacia el lado que no encierra a
  // nadie: un candado que no se puede leer no puede pedirse, y quedaria
  // cerrado para siempre sin forma de abrirlo.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("bloqueado");
    },
    removeItem: () => undefined
  };
  assert.equal(candadoActivado(), false);
  assert.doesNotThrow(() => guardarCandado(true));
});

test("sin haber salido de la app, no se vuelve a pedir", () => {
  assert.equal(hayQueVolverAPedir(null), false);
});

test("una salida corta NO vuelve a pedir la huella", () => {
  // Esto es tomar una foto: se abre la camara y se vuelve en segundos.
  const ahora = 1_000_000;
  assert.equal(hayQueVolverAPedir(ahora - 5_000, ahora), false);
  assert.equal(hayQueVolverAPedir(ahora - (GRACIA_MS - 1), ahora), false);
});

test("una salida larga SI vuelve a pedirla", () => {
  const ahora = 1_000_000;
  assert.equal(hayQueVolverAPedir(ahora - (GRACIA_MS + 1), ahora), true);
  assert.equal(hayQueVolverAPedir(ahora - 3_600_000, ahora), true);
});

test("la gracia es de un minuto, ni cero ni eterna", () => {
  // Cero haria inservible el flujo de fotos; muy larga dejaria el telefono
  // abierto en el mostrador toda la comida.
  assert.ok(GRACIA_MS >= 30_000 && GRACIA_MS <= 300_000, `gracia fuera de rango: ${GRACIA_MS}`);
});

/*
 * Las cuatro de abajo son de CABLEADO, no de lógica, y por eso miran la fuente:
 * los dos fallos que cubren se reportaron desde un teléfono y ninguno daba
 * error. Uno pintaba el candado un instante en el navegador --donde no hay
 * candado ninguno-- y el otro dejaba el candado encendido sin hacer nada.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

test("el velo nace OCULTO y solo lo enseña el atributo del arranque", () => {
  // ⚠️ El estado inicial de React no puede saber si el candado hace falta: eso
  // vive en localStorage y en el puente nativo. Sin esta regla, el velo se
  // pinta SIEMPRE un instante, tambien en Brave y en la PWA.
  const css = leer("app/globals.css");
  assert.match(css, /\.candado-pantalla\s*\{\s*display:\s*none;?\s*\}/, "el velo no nace oculto");
  assert.match(
    css,
    /html\[data-candado="1"\]\s+\.candado-pantalla\s*\{\s*display:\s*flex;?\s*\}/,
    "nada lo vuelve a enseñar"
  );

  // Y la clase de Tailwind `flex` NO puede estar en el elemento: pondria
  // `display:flex` con la misma especificidad y anularia el ocultado.
  const componente = leer("components/CandadoHuella.tsx");
  const velo = /className="candado-pantalla[^"]*"/.exec(componente);
  assert.ok(velo, "el velo no lleva la clase que lo oculta");
  assert.doesNotMatch(velo[0], /\bflex\b(?!-)/, "`flex` de Tailwind anula el ocultado del velo");
});

test("el guion de arranque y el componente usan la MISMA clave", () => {
  // Si divergen vuelve el parpadeo, o peor: el velo se queda puesto donde no
  // toca y no hay forma de quitarlo desde dentro.
  const clave = /const CLAVE = "([^"]+)"/.exec(leer("lib/candado-huella.ts"));
  assert.ok(clave, "no se encontró la clave del candado");
  assert.ok(
    leer("app/layout.tsx").includes(`localStorage.getItem('${clave[1]}')`),
    `el guion de arranque no lee ${clave[1]}`
  );
});

test("la referencia al plugin se guarda ANTES de mirar la preferencia", () => {
  /*
   * ⚠️ Este es el fallo reportado: guardarla solo cuando el candado ya estaba
   * encendido dejaba sin oyente a quien lo activara desde Perfil, asi que el
   * candado no hacia NADA hasta cerrar la app del todo. El layout raiz no se
   * remonta, o sea que no habia segunda oportunidad en toda la sesion.
   */
  const fuente = leer("components/CandadoHuella.tsx");
  const posPlugin = fuente.indexOf("plugin.current = bio;");
  const posPref = fuente.indexOf("if (!candadoActivado())");
  assert.ok(posPlugin > 0 && posPref > 0, "no se encontraron las dos lineas");
  assert.ok(
    posPlugin < posPref,
    "la preferencia se mira antes de guardar el plugin: activarlo desde Perfil no servira de nada"
  );
});

test("al volver a la app se relee la preferencia, no la del montaje", () => {
  // Se puede haber encendido o apagado desde Perfil sin reiniciar la app.
  const fuente = leer("components/CandadoHuella.tsx");
  const oyente = /const alCambiar = \(\) => \{[\s\S]*?\n {4}\};/.exec(fuente);
  assert.ok(oyente, "no se encontró el oyente de visibilidad");
  assert.match(oyente[0], /candadoActivado\(\)/, "el oyente no relee la preferencia");
  assert.doesNotMatch(
    fuente,
    /useEffect\(\(\) => \{\n    if \(!plugin\.current\) return;/,
    "el oyente vuelve a decidir al montar en vez de al volver"
  );
});
