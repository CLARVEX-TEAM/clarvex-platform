import assert from "node:assert/strict";
import test from "node:test";
import { findStaleRecordIds, findStaleScheduleIds, scheduleScopeDates } from "../lib/schedule-sync-diff";

const SAB = new Date("2026-07-11T00:00:00.000Z");
const DOM = new Date("2026-07-12T00:00:00.000Z");

const ALONSO = "user-alonso";
const JAZMIN = "user-jazmin";

test("intercambio de turno: se borra el turno viejo de quien ya no aparece", () => {
  // En la BD, Alonso tenía el sábado (dato viejo del Drive).
  const existing = [
    { id: "s1", userId: ALONSO, date: SAB },
    { id: "s2", userId: JAZMIN, date: DOM }
  ];
  // En el archivo corregido: el sábado ahora es de Jazmín y la celda de Alonso
  // quedó VACÍA (el parser no emite registro para celdas vacías).
  const fromFile = [
    { userId: JAZMIN, date: SAB },
    { userId: JAZMIN, date: DOM }
  ];

  const stale = findStaleScheduleIds(existing, fromFile);

  // Sin esto, Alonso y Jazmín aparecían AMBOS laborando el sábado.
  assert.deepEqual(stale, ["s1"]);
});

test("no borra nada cuando el archivo respalda todos los turnos guardados", () => {
  const existing = [
    { id: "s1", userId: ALONSO, date: SAB },
    { id: "s2", userId: JAZMIN, date: DOM }
  ];
  const fromFile = [
    { userId: ALONSO, date: SAB },
    { userId: JAZMIN, date: DOM }
  ];
  assert.deepEqual(findStaleScheduleIds(existing, fromFile), []);
});

test("el alcance del borrado son solo las fechas presentes en el archivo", () => {
  const dates = scheduleScopeDates([
    { userId: ALONSO, date: SAB },
    { userId: JAZMIN, date: SAB }, // misma fecha: no se duplica
    { userId: JAZMIN, date: DOM }
  ]);
  assert.equal(dates.length, 2);
  assert.deepEqual(dates.map((date) => date.toISOString()), [SAB.toISOString(), DOM.toISOString()]);
});

test("archivo sin registros no borra nada (protege de vaciar la BD)", () => {
  const existing = [{ id: "s1", userId: ALONSO, date: SAB }];
  // Un archivo que no produjo registros NO debe interpretarse como "nadie
  // trabaja": el sync acota por fechas del archivo, y sin fechas no hay alcance.
  assert.deepEqual(scheduleScopeDates([]), []);
  // (findStaleScheduleIds solo se llama con un alcance no vacío; aquí se
  // documenta que sin alcance el sync ni siquiera consulta la BD.)
  assert.equal(existing.length, 1);
});

test("KPI: presupuesto reasignado borra la meta vieja que quedó sin celda", () => {
  // Caso real (15-jul-2026): Jazmín y Alonso se intercambiaron horarios y también
  // presupuestos. Al mover la meta de Jazmín a Alonso, la casilla de Jazmín del
  // día quedó VACÍA en el RDV. El parser no emite registro para casillas vacías,
  // así que su meta vieja (11,307.35) sobrevivía y se sumaba al total de tienda:
  // aparecían Alonso y Jazmín con el MISMO presupuesto.
  const existing = [
    { id: "k-alonso", userId: ALONSO, date: SAB },
    { id: "k-jazmin", userId: JAZMIN, date: SAB } // meta vieja, ya sin respaldo
  ];
  const fromFile = [{ userId: ALONSO, date: SAB }]; // solo Alonso trae meta ese día

  assert.deepEqual(findStaleRecordIds(existing, fromFile), ["k-jazmin"]);
});
