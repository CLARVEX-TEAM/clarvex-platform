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

test("⚠️ la tarjeta NO se pinta sin reconocimiento", () => {
  /*
   * Una tarjeta vacía diciendo «0 este mes» todos los días es un recordatorio
   * diario de que nadie te reconoció — lo contrario de para lo que existe. La
   * condición vive en `app/mi-dia/page.tsx` y esto la fija.
   */
  const fuente = readFileSync("app/mi-dia/page.tsx", "utf8");
  assert.match(
    fuente,
    /data\.kudos && data\.kudos\.recibidosMes > 0/,
    "la tarjeta de Kudos tiene que seguir condicionada a que haya alguno"
  );
});

test("solo se pide lo ULTIMO, no el historial entero", () => {
  // «Mi día» es una pantalla de arranque: una lista de reconocimientos la
  // convertiría en otra cosa y empujaría abajo lo que hay que hacer hoy.
  const fuente = readFileSync("app/api/app/native/my-day/route.ts", "utf8");
  assert.match(fuente, /toUserId: session\.userId/, "solo los RECIBIDOS");
  assert.match(fuente, /take: 50/, "con tope, para contar sin traerlo todo");
});
