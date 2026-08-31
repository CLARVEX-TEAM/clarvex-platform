import assert from "node:assert/strict";
import test from "node:test";
import { antiguedad, cumpleHoy, cumpleaños, puestoLegible } from "../lib/perfil-compañero";

const HOY = new Date("2026-08-31T18:00:00Z");

test("la antiguedad cuenta anos y meses", () => {
  assert.equal(antiguedad("2023-06-15", HOY), "3 años y 2 meses");
  assert.equal(antiguedad("2025-08-31", HOY), "1 año");
  assert.equal(antiguedad("2026-03-31", HOY), "5 meses");
  assert.equal(antiguedad("2026-07-31", HOY), "1 mes");
});

test("un mes no cumplido no se cuenta", () => {
  // Entro el 15; hoy es 31 pero del mismo mes: no ha cumplido el mes.
  assert.equal(antiguedad("2026-08-15", HOY), "recién ingresó");
  // Entro el 30 del mes pasado: ya lleva un mes cumplido.
  assert.equal(antiguedad("2026-07-30", HOY), "1 mes");
  // Entro el 31 del mes pasado pero hoy es 30 -> aun no.
  assert.equal(antiguedad("2026-07-31", new Date("2026-08-30T18:00:00Z")), "recién ingresó");
});

test("una fecha futura no da antiguedad negativa", () => {
  // Un dedazo al capturar el alta no debe imprimir «-2 meses».
  assert.equal(antiguedad("2027-01-01", HOY), null);
});

test("sin fecha de alta no se inventa nada", () => {
  assert.equal(antiguedad(null, HOY), null);
  assert.equal(antiguedad("no-es-fecha", HOY), null);
});

test("el cumpleanos va SIN ano", () => {
  // La edad no es asunto del chat de la tienda.
  assert.equal(cumpleaños("1994-03-14"), "14 de marzo");
  assert.equal(cumpleaños("2001-12-01"), "1 de diciembre");
  assert.ok(!/\d{4}/.test(cumpleaños("1994-03-14") ?? ""));
});

test("sin cumpleanos no se pinta nada", () => {
  assert.equal(cumpleaños(null), null);
  assert.equal(cumpleaños("14/03/1994"), null);
  assert.equal(cumpleaños("1994-13-01"), null);
});

test("cumpleHoy compara mes y dia como texto", () => {
  /*
   * Sin construir fechas: hacerlo con Date arrastra la zona horaria y correria
   * el dia. Es el mismo fallo que ya se pago con las devoluciones y con
   * to_char, y aqui haria felicitar a alguien un dia antes o despues.
   */
  assert.ok(cumpleHoy("1994-08-31", new Date("2026-08-31T23:30:00")));
  assert.ok(cumpleHoy("1994-08-31", new Date("2026-08-31T00:30:00")));
  assert.ok(!cumpleHoy("1994-09-01", new Date("2026-08-31T23:30:00")));
  assert.ok(!cumpleHoy(null, HOY));
});

test("el puesto se dice como en tienda", () => {
  assert.equal(puestoLegible("GERENTE"), "Gerente");
  assert.equal(puestoLegible("SUBGERENTE"), "Subgerente");
  assert.equal(puestoLegible("ASESOR"), "Asesor");
  // El kiosko esta dado de alta como ASESOR: cae en el caso por omision y no
  // rompe la ficha.
  assert.equal(puestoLegible("LO_QUE_SEA"), "Asesor");
});
