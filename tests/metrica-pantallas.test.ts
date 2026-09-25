import assert from "node:assert/strict";
import test from "node:test";
import {
  desdeDondeSeAbrio,
  REPETICION_MINIMA_MS,
  rutaMedible,
  seApunta
} from "../lib/metrica-pantallas";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Esta métrica existe porque la anterior se equivocó.** El 24 de
 * septiembre de 2026 se decidió cerrar quince pantallas contando ESCRITURAS, y
 * en menos de un día la gerente preguntó por qué ya no le salían. Lo que se
 * midió fue quién escribe, no quién mira.
 *
 * Si esta se equivoca también, el error sale caro por el mismo camino: se
 * apagará algo que sí se usa, o se sostendrá algo que no. Las tres formas de
 * equivocarse están cubiertas abajo.
 */

test("⚠️ el detalle de un conteo se apunta por PATRON, no por su id", () => {
  /*
   * Sin esto cada conteo sería su propia «pantalla»: cientos de filas con una
   * visita cada una, y ninguna forma de responder cuánta gente abre el detalle.
   */
  assert.equal(rutaMedible("/conteos/cmr9yr6te05qagemyll8vv48f"), "/conteos/[id]");
  assert.equal(rutaMedible("/conteos/otro-id-distinto"), "/conteos/[id]");
  assert.equal(rutaMedible("/chat/sala-123"), "/chat/[id]");
  assert.equal(rutaMedible("/soporte/caso-9"), "/soporte/[id]");
});

test("las pantallas propias de conteos NO caen en el patron del detalle", () => {
  // `/conteos/marbetes` es una pantalla, no el conteo con id «marbetes».
  assert.equal(rutaMedible("/conteos/marbetes"), "/conteos/marbetes");
  assert.equal(rutaMedible("/conteos/dama"), "/conteos/dama");
  assert.equal(rutaMedible("/conteos/marbetes/imprimir"), "/conteos/marbetes/imprimir");
  assert.equal(rutaMedible("/checklist/config"), "/checklist/config");
});

test("⚠️ las pantallas SIN sesion no se apuntan", () => {
  /*
   * `/login` y `/v/<token>` se abren sin sesión --la credencial la escanea un
   * desconocido con una cámara--. Apuntarlas mezclaría visitas anónimas con el
   * uso del equipo, que es exactamente lo que se quiere separar.
   */
  assert.equal(rutaMedible("/login"), null);
  assert.equal(rutaMedible("/v/un-token-firmado"), null);
  assert.equal(rutaMedible("/recuperar"), null);
  assert.equal(rutaMedible("/recuperar/token-de-correo"), null);
  assert.equal(rutaMedible("/terminos"), null);
  assert.equal(rutaMedible("/producto"), null);
});

test("⚠️ la raiz no es una pantalla", () => {
  // `app/page.tsx` solo reparte; contarla duplicaría cada arranque de la app.
  assert.equal(rutaMedible("/"), null);
});

test("⚠️ lo que manda el cliente NO se guarda tal cual", () => {
  /*
   * `pathname` viene del navegador. Sin este candado la columna sería texto
   * libre y bastaría una ruta inventada para meter en la base algo que nadie
   * quería guardar.
   */
  assert.equal(rutaMedible("/inventada/por/alguien"), null);
  assert.equal(rutaMedible("/kpis/../../etc/passwd"), null);
  assert.equal(rutaMedible("/api/app-data"), null);
  assert.equal(rutaMedible("/_next/static/chunk.js"), null);
  assert.equal(rutaMedible("sin-barra-inicial"), null);
  assert.equal(rutaMedible(null), null);
  assert.equal(rutaMedible(undefined), null);
});

test("la consulta y el ancla no hacen otra pantalla", () => {
  assert.equal(rutaMedible("/kpis?vista=semana"), "/kpis");
  assert.equal(rutaMedible("/pendientes#arriba"), "/pendientes");
  assert.equal(rutaMedible("/kpis/"), "/kpis");
});

test("el escritorio se mide aparte del telefono", () => {
  // Son dos superficies distintas y la pregunta «quién usa qué» las separa.
  assert.equal(rutaMedible("/kpis"), "/kpis");
  assert.equal(rutaMedible("/escritorio/kpis"), "/escritorio/kpis");
  assert.equal(rutaMedible("/escritorio/conteos/un-id"), "/escritorio/conteos/[id]");
});

test("⚠️ se compara el PREFIJO del agente, nunca la version", () => {
  /*
   * Cada APK escribe la suya. Buscar una exacta dejaría fuera a los teléfonos
   * sin actualizar, que son justo los que no se arreglan publicando otra APK.
   */
  assert.equal(desdeDondeSeAbrio("Mozilla/5.0 (Linux; Android 15) ClarvexApp/1.8"), "apk");
  assert.equal(desdeDondeSeAbrio("Mozilla/5.0 (Linux; Android 13) ClarvexApp/1.3"), "apk");
  assert.equal(desdeDondeSeAbrio("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "web");
  assert.equal(desdeDondeSeAbrio(null), "web");
});

test("⚠️ un rebote a la misma pantalla no cuenta como visita nueva", () => {
  /*
   * Sin este freno, quien entra y sale de Conteos cinco veces en un minuto
   * pesaría lo mismo que cinco personas usándola. Se cuenta «la abrió», no «el
   * componente se montó».
   */
  const t0 = 1_000_000;
  assert.equal(seApunta("/conteos", null, t0), true, "la primera siempre");
  assert.equal(seApunta("/conteos", { ruta: "/conteos", cuando: t0 }, t0 + 5_000), false);
  assert.equal(
    seApunta("/conteos", { ruta: "/conteos", cuando: t0 }, t0 + REPETICION_MINIMA_MS),
    true,
    "pasado el freno sí cuenta"
  );
});

test("cambiar de pantalla cuenta aunque sea al instante", () => {
  // El freno es por repetición de LA MISMA, no un límite de navegación.
  const t0 = 1_000_000;
  assert.equal(seApunta("/kpis", { ruta: "/conteos", cuando: t0 }, t0 + 100), true);
});
