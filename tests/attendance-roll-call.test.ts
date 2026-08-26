import assert from "node:assert/strict";
import test from "node:test";
import { planPaseDeLista, type TurnoDelDia } from "../lib/attendance-roll-call-plan";

const FECHA = "2026-08-26";

const TURNOS: TurnoDelDia[] = [
  { employeeNumber: "81893", name: "ITZEL", startTime: "10:30" },
  { employeeNumber: "95739", name: "WAIRA", startTime: "11:00" },
  { employeeNumber: "102259", name: "ADRIAN", startTime: null }
];

test("sin novedad marca a cada quien a SU hora, no a una hora comun", () => {
  const plan = planPaseDeLista(TURNOS, [], new Set(), FECHA);
  const porNumero = new Map(plan.entries.map((e) => [e.employeeNumber, e.arrivedAt]));

  assert.equal(plan.entries.length, 3);
  assert.equal(porNumero.get("81893"), "10:30");
  // Waira entra mas tarde: marcarla a las 10:30 le regalaria media hora.
  assert.equal(porNumero.get("95739"), "11:00");
  // Sin hora en el horario se cae a la estandar de tienda, como el importador.
  assert.equal(porNumero.get("102259"), "10:30");
});

test("la excepcion se aplica solo a quien se nombra", () => {
  const plan = planPaseDeLista(TURNOS, [{ employeeNumber: "81893", arrivedAt: "11:05" }], new Set(), FECHA);
  const porNumero = new Map(plan.entries.map((e) => [e.employeeNumber, e.arrivedAt]));

  assert.equal(porNumero.get("81893"), "11:05");
  assert.equal(porNumero.get("95739"), "11:00");
  assert.equal(porNumero.get("102259"), "10:30");
});

test("a quien ya tiene asistencia NO se le toca", () => {
  // El caso real: mandar "sin novedad" dos veces, o despues de corregir a
  // alguien en Retool. Pisar eso borraria trabajo hecho sin avisar.
  const plan = planPaseDeLista(TURNOS, [], new Set(["81893"]), FECHA);

  assert.equal(plan.entries.length, 2);
  assert.equal(plan.entries.some((e) => e.employeeNumber === "81893"), false);
  assert.deepEqual(plan.respetados, [{ employeeNumber: "81893", name: "ITZEL" }]);
});

test("nombrar a alguien SI pisa su registro anterior", () => {
  // No contradice la prueba anterior: escribir el numero es una instruccion
  // explicita. Lo que se protege es lo que ocurriria sin querer.
  const plan = planPaseDeLista(TURNOS, [{ employeeNumber: "81893", arrivedAt: "12:00" }], new Set(["81893"]), FECHA);

  const itzel = plan.entries.find((e) => e.employeeNumber === "81893");
  assert.ok(itzel, "Itzel deberia entrar aunque ya tuviera registro");
  assert.equal(itzel.arrivedAt, "12:00");
  assert.equal(plan.respetados.length, 0);
});

test("una falta se manda como texto, sin hora", () => {
  const plan = planPaseDeLista(TURNOS, [{ employeeNumber: "95739", entryText: "FALTA" }], new Set(), FECHA);
  const waira = plan.entries.find((e) => e.employeeNumber === "95739");

  assert.ok(waira);
  assert.equal(waira.arrivedAt, null);
  assert.equal(waira.entryText, "FALTA");
});

test("una excepcion sobre alguien sin turno se avisa y no se marca", () => {
  // Un numero mal tecleado no puede acabar generando asistencia de nadie.
  const plan = planPaseDeLista(TURNOS, [{ employeeNumber: "99999", arrivedAt: "10:30" }], new Set(), FECHA);

  assert.deepEqual(plan.sinTurno, ["99999"]);
  assert.equal(plan.entries.some((e) => e.employeeNumber === "99999"), false);
  assert.equal(plan.entries.length, 3);
});

test("quien no trabaja ese dia no aparece en el pase de lista", () => {
  // Los turnos ya llegan filtrados por estado; con la lista vacia no se
  // inventa a nadie.
  const plan = planPaseDeLista([], [], new Set(), FECHA);
  assert.deepEqual(plan.entries, []);
  assert.deepEqual(plan.respetados, []);
});

test("todas las filas llevan la fecha que se pidio", () => {
  const plan = planPaseDeLista(TURNOS, [], new Set(), FECHA);
  assert.equal(plan.entries.every((e) => e.date === FECHA), true);
});
