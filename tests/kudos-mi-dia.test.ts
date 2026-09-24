import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { retailMonthBoundsFor } from "../lib/report-deadlines";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **El mes de los Kudos es el RETAIL, no el natural**, como todo lo demás de
 * esta app. Mezclarlos ya costó caro en asistencia: agosto natural trae cinco
 * domingos y el retail cuatro, y por natural se habría pagado una prima
 * dominical de más por persona. El fallo estuvo meses invisible porque en julio
 * los dos daban lo mismo.
 *
 * ⚠️ Y `retailMonthBoundsFor` devuelve **fechas**, no cadenas. Envolverlas en una
 * plantilla da una fecha inválida y el tipado NO lo atrapa: la consulta se iría
 * en silencio con `Invalid Date`. Pasó al escribir esto.
 */

test("⚠️ los limites del mes retail son FECHAS utilizables", () => {
  const limites = retailMonthBoundsFor(new Date("2026-09-19T00:00:00.000Z"));
  assert.ok(limites.start instanceof Date, "start es una fecha, no una cadena");
  assert.ok(limites.end instanceof Date, "end es una fecha, no una cadena");
  assert.ok(Number.isFinite(limites.start.getTime()), "y es válida");
  assert.ok(Number.isFinite(limites.end.getTime()));
  assert.ok(limites.start.getTime() < limites.end.getTime(), "el mes va hacia adelante");
});

test("⚠️ envolverlas en una plantilla da una fecha INVALIDA", () => {
  /*
   * Esto es exactamente el error que se cometió. Se deja escrito para que quien
   * copie el patrón de otra consulta vea por qué no vale aquí.
   */
  const limites = retailMonthBoundsFor(new Date("2026-09-19T00:00:00.000Z"));
  const malo = new Date(`${limites.start}T00:00:00.000Z`);
  assert.ok(Number.isNaN(malo.getTime()), "la plantilla produce Invalid Date");
});

test("⚠️ la tarjeta de Kudos ya NO se pinta en Mi dia", () => {
  /*
   * Mientras existió, la condición era `data.kudos && data.kudos.recibidosMes > 0`:
   * una tarjeta vacía diciendo «0 este mes» todos los días es un recordatorio
   * diario de que nadie te reconoció. La fase 2 del plan de apagado (24 de
   * septiembre de 2026) cerró Kudos, así que la tarjeta salió entera. Si vuelve,
   * vuelve con esa condición.
   */
  const fuente = readFileSync("app/mi-dia/page.tsx", "utf8");
  assert.doesNotMatch(fuente, /href="\/kudos"/, "Mi día no puede volver a abrir Kudos");
});

test("solo se pide lo ULTIMO, no el historial entero", () => {
  // «Mi día» es una pantalla de arranque: una lista de reconocimientos la
  // convertiría en otra cosa y empujaría abajo lo que hay que hacer hoy.
  const fuente = readFileSync("app/api/app/native/my-day/route.ts", "utf8");
  assert.match(fuente, /toUserId: session\.userId/, "solo los RECIBIDOS");
  assert.match(fuente, /take: 50/, "con tope, para contar sin traerlo todo");
});
