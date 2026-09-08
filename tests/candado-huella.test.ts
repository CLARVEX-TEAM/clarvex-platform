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
 * ⚠️ **Estas comprobaciones sobre la fuente NO pueden anclar en un salto de
 * línea literal.** El repositorio guarda LF y el working tree de Windows queda
 * en CRLF en cuanto git toca el archivo: un `\n` en el patrón pasa en CI y falla
 * en local. Y en un `doesNotMatch` es peor, porque pasa por el motivo
 * equivocado y deja de vigilar nada sin que se note.
 *
 * Lo que se afirma aquí es el ORDEN de las cosas, no el blanco que las separa.
 * Por eso van con `\s*` o `\r?\n`.
 */

/*
 * Las de abajo son de CABLEADO, no de lógica, y por eso miran la fuente:
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
  const oyente = /const alCambiar = \(\) => \{[\s\S]*?\r?\n {4}\};/.exec(fuente);
  assert.ok(oyente, "no se encontró el oyente de visibilidad");
  assert.match(oyente[0], /candadoActivado\(\)/, "el oyente no relee la preferencia");
  assert.doesNotMatch(
    fuente,
    /useEffect\(\(\) => \{\s*if \(!plugin\.current\) return;/,
    "el oyente vuelve a decidir al montar en vez de al volver"
  );
});

test("no se da por vencido a la primera si el puente aun no llego", () => {
  /*
   * ⚠️ El puente de Capacitor se inyecta al arrancar el documento, pero si el
   * WebView del telefono no admite ese enganche llega DESPUES de que React
   * monte. Preguntar una sola vez y concluir «no hay contenedor» dejaba el
   * candado sin pedir la huella NUNCA --con el interruptor encendido y todo
   * verde en el diagnostico, porque para cuando se mira el puente ya llego.
   *
   * Aqui si toca sondear en vez de esperar un evento: la llegada del puente no
   * dispara ninguno. Pero ACOTADO, porque en un navegador no va a llegar nunca.
   */
  const fuente = readFileSync(join(raiz, "components", "CandadoHuella.tsx"), "utf8");
  assert.match(fuente, /ESPERA_PUENTE_MS/, "no espera al puente");
  assert.doesNotMatch(
    fuente,
    /useEffect\(\(\) => \{\n    if \(!enContenedorNativo\(\)\) \{\n      setEstado\("abierto"\);/,
    "vuelve a rendirse a la primera si el puente no ha llegado"
  );

  const espera = /const ESPERA_PUENTE_MS = ([\d_]+)/.exec(fuente);
  assert.ok(espera, "no se encontró la espera");
  const ms = Number(espera[1].replace(/_/g, ""));
  // Ni cero --no serviría de nada-- ni tanto que un navegador se quede mirando.
  assert.ok(ms >= 1_000 && ms <= 10_000, `espera fuera de rango: ${ms}`);
});

test("espera al PLUGIN, no solo al contenedor", () => {
  /*
   * ⚠️ Medido en un teléfono: el contenedor decía «listo» a los **0 ms** y el
   * plugin todavía no estaba, porque `PluginHeaders` --la lista que consulta
   * `isPluginAvailable`-- la inyecta Capacitor en un guion aparte que llega
   * después. La traza real fue:
   *
   *     contenedor listo tras 0 ms
   *     sin plugin Biometria -> abierto
   *
   * ...y un segundo más tarde el plugin ya estaba. Esperar solo al contenedor
   * no arregla nada: ese nunca es el que falta.
   */
  const fuente = readFileSync(join(raiz, "components", "CandadoHuella.tsx"), "utf8");

  // La condición de espera tiene que incluir el plugin.
  assert.match(
    fuente,
    /const bio = enContenedorNativo\(\) \? biometriaNativa\(\) : null;/,
    "la espera no mira el plugin"
  );
  // Y no puede volver a rendirse en cuanto el contenedor diga que sí.
  assert.doesNotMatch(
    fuente,
    /if \(!enContenedorNativo\(\)\) \{\s*if \(esperado >= ESPERA_PUENTE_MS\)/,
    "vuelve a esperar solo al contenedor"
  );
  // Y al volver de segundo plano se recupera si la ventana de arranque falló.
  assert.match(fuente, /al volver: plugin recuperado/, "no reintenta conseguir el plugin al volver");
});

test("lo que va ENCIMA de la barra sube con la barrita de gestos", () => {
  /*
   * ⚠️ Todos estos estaban calibrados para una barra inferior pegada al borde.
   * Al separarla de la barrita de gestos, la barra subió y se los tragó: en
   * Pendientes el botón «Crear» quedó encima de las pestañas y no se podía
   * tocar. Reportado desde un teléfono.
   *
   * ⚠️ Y `env(safe-area-inset-bottom)` NO vale aquí: dentro del WebView de
   * Android es cero. Es el mismo error que se arregló en el resto de la app.
   */
  const encimaDeLaBarra = [
    "components/ui/QuickLink.tsx",
    "components/ActualizacionApp.tsx",
    "components/PwaRegister.tsx",
    "components/UpdatePrompt.tsx",
    "components/EmailBanner.tsx"
  ];
  for (const ruta of encimaDeLaBarra) {
    const fuente = readFileSync(join(raiz, ruta), "utf8");
    const fijos = fuente.match(/fixed[^"]*bottom-\[?[^\s"]*/g) ?? [];
    assert.ok(fijos.length > 0, `${ruta}: no se encontró ningún elemento fijo abajo`);
    for (const clase of fijos) {
      assert.match(clase, /var\(--safe-bottom\)/, `${ruta}: «${clase}» no sube con la barrita de gestos`);
      assert.doesNotMatch(clase, /env\(safe-area-inset-bottom\)/, `${ruta}: «${clase}» usa env(), que en la app vale cero`);
    }
  }
});

test("el tiempo fuera se consume al decidir, no al acertar", () => {
  // ⚠️ Antes solo se borraba cuando la huella salia bien: quien cancelara una
  // vez quedaba con la marca vieja y cada regreso volvia a pedirla, sin haber
  // salido de nuevo.
  const fuente = readFileSync(join(raiz, "components", "CandadoHuella.tsx"), "utf8");
  assert.match(
    fuente,
    /if \(!toca\) return;[\s\S]{0,800}salioEn\.current = null;\s*void pedir\(\);/,
    "no se limpia el tiempo fuera antes de pedirla"
  );
});

test("con el velo ya puesto NO se vuelve a lanzar el dialogo", () => {
  /*
   * ⚠️ Un candado cerrado ya tiene su boton de «Desbloquear». Volver a lanzar
   * el dialogo cada vez que la app reaparece --el teclado, un gesto, un aviso
   * del sistema-- es lo que se siente como «me la pide al cambiar de pantalla».
   * Reportado desde un telefono.
   */
  const fuente = readFileSync(join(raiz, "components", "CandadoHuella.tsx"), "utf8");
  assert.match(
    fuente,
    /if \(estadoRef\.current !== "abierto"\) \{/,
    "se puede volver a pedir la huella con el velo ya puesto"
  );
});
