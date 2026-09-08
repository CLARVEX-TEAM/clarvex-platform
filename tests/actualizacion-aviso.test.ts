import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { RECHEQUEO_MS, hayQueMirar, siguePendiente, urlAbsolutaDeDescarga } from "../lib/actualizacion-app";

/*
 * Por qué existen estas pruebas.
 *
 * El aviso de actualización falla SIEMPRE en silencio. No hay pantalla de error
 * ni línea de registro: la persona simplemente no ve nada, exactamente igual
 * que cuando de verdad no hay versión nueva. Los dos casos son indistinguibles
 * desde fuera, así que un fallo aquí puede durar meses.
 *
 * Y ya duró. El 7 de septiembre de 2026 se publicó la 1.3 con la app abierta y
 * no la ofreció a nadie: el efecto miraba una vez por documento --dependencias
 * vacías, en el layout raíz, que no se remonta-- así que la respuesta «estás al
 * día» de las nueve de la mañana valía para todo el día.
 */

test("sin respuesta definitiva se mira siempre", () => {
  // Es el 401 del login: la sesión aparece un instante después, al navegar.
  assert.equal(
    hayQueMirar({ pendiente: true, descargando: false, ultimaMirada: 0, ahora: 1_000 }),
    true
  );
});

test("nunca a media descarga", () => {
  // ⚠️ Volver a preguntar reescribiría el estado de la tarjeta y la barra de
  // progreso desaparecería con el archivo a medias.
  assert.equal(
    hayQueMirar({ pendiente: true, descargando: true, ultimaMirada: 0, ahora: 10 ** 9 }),
    false
  );
  assert.equal(
    hayQueMirar({ pendiente: false, descargando: true, ultimaMirada: 0, ahora: 10 ** 9 }),
    false
  );
});

test("estando al dia NO se pregunta en cada pantalla", () => {
  // La app se abre y se cierra decenas de veces por turno. Preguntar en cada
  // toque sería una peticion firmada por navegación.
  const ahora = 10 ** 9;
  assert.equal(
    hayQueMirar({ pendiente: false, descargando: false, ultimaMirada: ahora - 1_000, ahora }),
    false
  );
});

test("pero se vuelve a preguntar pasada la ventana", () => {
  // Esto es lo que faltaba: una version publicada con la app YA abierta.
  const ahora = 10 ** 9;
  assert.equal(
    hayQueMirar({ pendiente: false, descargando: false, ultimaMirada: ahora - RECHEQUEO_MS, ahora }),
    true
  );
  assert.equal(
    hayQueMirar({ pendiente: false, descargando: false, ultimaMirada: 0, ahora }),
    true
  );
});

test("la ventana es de minutos, ni cero ni un dia", () => {
  assert.ok(
    RECHEQUEO_MS >= 5 * 60_000 && RECHEQUEO_MS <= 2 * 60 * 60_000,
    `ventana fuera de rango: ${RECHEQUEO_MS}`
  );
});

test("401 es «todavia no se», cualquier otro rechazo es definitivo", () => {
  // ⚠️ Confundirlos es lo que dejaba la comprobación muerta al arrancar en el
  // login; al revés, insistir ante un 500 la repetiría en cada pantalla.
  assert.equal(siguePendiente(401), true);
  assert.equal(siguePendiente(403), false);
  assert.equal(siguePendiente(500), false);
  assert.equal(siguePendiente(404), false);
});

test("el componente reintenta por EVENTO, no una sola vez", () => {
  /*
   * El fallo real no estaba en una función sino en un array de dependencias
   * vacío, así que se comprueba sobre la fuente: es donde vive.
   */
  const fuente = readFileSync(join(__dirname, "..", "components", "ActualizacionApp.tsx"), "utf8");

  assert.match(
    fuente,
    /visibilitychange/,
    "sin escuchar el regreso a la app, una versión publicada con la app abierta no se ofrece nunca"
  );
  assert.match(
    fuente,
    /\}, \[pathname\]\);/,
    "sin reintentar al cambiar de pantalla, el 401 del login mata la comprobación para toda la sesión"
  );
  assert.match(
    fuente,
    /siguePendiente\(respuesta\.status\)/,
    "un rechazo tiene que distinguir «no hay sesión» de «no hay actualización»"
  );
  assert.doesNotMatch(
    fuente,
    /if \(!respuesta\.ok \|\| !vivo\) return;/,
    "vuelve a tratar cualquier rechazo como definitivo"
  );
});

test("la direccion de descarga se manda ABSOLUTA al descargador nativo", () => {
  // ⚠️ Quien descarga es Java, no el WebView: `new URL("/api/app/apk?t=…")`
  // lanza `no protocol` y el error sale en rojo con el token a la vista.
  const origen = "https://team.clarvex.tech";
  assert.equal(
    urlAbsolutaDeDescarga("/api/app/apk?t=abc.def.ghi", origen),
    "https://team.clarvex.tech/api/app/apk?t=abc.def.ghi"
  );
});

test("el token del enlace sobrevive intacto", () => {
  // Un JWT lleva puntos, guiones y guiones bajos; si algo los reescribiera, la
  // firma dejaria de validar y la descarga daria 401 en vez de un error claro.
  const t = "eyJhbGciOiJIUzI1NiJ9.eyJ2Ijo0LCJzdWIiOiJhZHJpYW4ifQ.N_2X9Wobv2dlhI-a";
  const salida = urlAbsolutaDeDescarga(`/api/app/apk?t=${t}`, "https://team.clarvex.tech");
  assert.ok(salida.endsWith(`?t=${t}`), salida);
});

test("una direccion ya absoluta se deja como esta", () => {
  // Asi el dia que el servidor las mande enteras esto no estorba.
  const abs = "https://team.clarvex.tech/api/app/apk?t=abc";
  assert.equal(urlAbsolutaDeDescarga(abs, "https://otra.cosa.tech"), abs);
});

test("forzar pregunta aunque no toque, pero NUNCA a media descarga", () => {
  const ahora = 10 ** 9;
  // Es lo que pasa al volver de los ajustes de Android con el permiso ya dado:
  // toca pedir un enlace nuevo aunque se preguntara hace un minuto.
  assert.equal(
    hayQueMirar({ pendiente: false, descargando: false, ultimaMirada: ahora - 1_000, ahora, forzar: true }),
    true
  );
  // ⚠️ Pero forzar no puede saltarse la descarga en curso: la barra de progreso
  // desapareceria con el archivo a medias.
  assert.equal(
    hayQueMirar({ pendiente: false, descargando: true, ultimaMirada: 0, ahora, forzar: true }),
    false
  );
});

test("el componente vuelve a mirar el PERMISO al regresar de los ajustes", () => {
  /*
   * ⚠️ El permiso de instalar se concede FUERA de la app. Sin volver a mirarlo,
   * la tarjeta seguia diciendo «Abrir ajustes de Android» con el permiso ya
   * dado, y habia que cerrar la app entera. Reportado en un telefono real.
   */
  const fuente = readFileSync(join(__dirname, "..", "components", "ActualizacionApp.tsx"), "utf8");
  assert.match(
    fuente,
    /estadoRef\.current === "sin-permiso"[\s\S]{0,400}puedeInstalar\(\)/,
    "al volver a la app no se comprueba si ya concedieron el permiso"
  );
  assert.match(
    fuente,
    /comprobar\(true\)/,
    "tras conceder el permiso hace falta un enlace nuevo: el anterior dura diez minutos"
  );
});

test("el componente manda la direccion ABSOLUTA, no la del manifiesto", () => {
  const fuente = readFileSync(join(__dirname, "..", "components", "ActualizacionApp.tsx"), "utf8");
  assert.match(
    fuente,
    /urlAbsolutaDeDescarga\(nueva\.url, window\.location\.origin\)/,
    "el descargador nativo hace new URL(): una ruta relativa lanza «no protocol»"
  );
  assert.doesNotMatch(
    fuente,
    /descargarEInstalar\(\{ url: nueva\.url/,
    "vuelve a mandar la ruta relativa al descargador nativo"
  );
});
