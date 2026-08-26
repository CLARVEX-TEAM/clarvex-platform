import assert from "node:assert/strict";
import test from "node:test";
import { planPaseDeLista, type TurnoDelDia } from "../lib/attendance-roll-call-plan";

const FECHA = "2026-08-26";

const TURNOS: TurnoDelDia[] = [
  { employeeNumber: "81893", name: "ITZEL", startTime: "10:30", scheduled: "WORKING" },
  { employeeNumber: "95739", name: "WAIRA", startTime: "11:00", scheduled: "WORKING" },
  { employeeNumber: "102259", name: "ADRIAN", startTime: null, scheduled: "WORKING" }
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

test("se puede nombrar a la persona en vez de teclear su numero", () => {
  const plan = planPaseDeLista(TURNOS, [{ name: "Waira", arrivedAt: "11:40" }], new Set(), FECHA);
  const waira = plan.entries.find((e) => e.employeeNumber === "95739");

  assert.ok(waira);
  assert.equal(waira.arrivedAt, "11:40");
  assert.deepEqual(plan.sinTurno, []);
});

test("el nombre casa sin acentos ni mayusculas", () => {
  const conAcento: TurnoDelDia[] = [{ employeeNumber: "1", name: "JAZMIN CASTRO ZUÑIGA", startTime: "10:30", scheduled: "WORKING" }];
  const plan = planPaseDeLista(conAcento, [{ name: "jazmín", arrivedAt: "10:45" }], new Set(), FECHA);

  assert.equal(plan.entries[0].arrivedAt, "10:45");
});

test("Adrian se busca por su segundo nombre, no por Jesus", () => {
  // La tienda le dice Adrian; su nombre completo empieza por JESUS.
  const plan = planPaseDeLista(
    [{ employeeNumber: "102259", name: "JESUS ADRIAN HERNANDEZ LUNA", startTime: "10:30", scheduled: "WORKING" }],
    [{ name: "Adrian", arrivedAt: "11:00" }],
    new Set(),
    FECHA
  );
  assert.equal(plan.entries[0].arrivedAt, "11:00");
});

test("un nombre que casa con DOS personas no marca a ninguna", () => {
  // Marcar a la equivocada toca el sueldo de dos a la vez y en silencio: la
  // que no vino saldria puntual y la que llego tarde no constaria.
  const dosMarias: TurnoDelDia[] = [
    { employeeNumber: "1", name: "MARIA LOPEZ", startTime: "10:30", scheduled: "WORKING" },
    { employeeNumber: "2", name: "MARIA GOMEZ", startTime: "10:30", scheduled: "WORKING" }
  ];
  const plan = planPaseDeLista(dosMarias, [{ name: "Maria", arrivedAt: "12:00" }], new Set(), FECHA);

  assert.deepEqual(plan.ambiguos, ["Maria"]);
  // Las dos siguen entrando, pero a SU hora: nadie recibe la excepcion.
  assert.equal(plan.entries.length, 2);
  assert.equal(plan.entries.every((e) => e.arrivedAt === "10:30"), true);
});

test("un nombre que no existe se avisa y no marca a nadie de mas", () => {
  const plan = planPaseDeLista(TURNOS, [{ name: "Fulanito" }], new Set(), FECHA);
  assert.deepEqual(plan.sinTurno, ["Fulanito"]);
  assert.equal(plan.entries.length, 3);
});

test("a quien descansa se le marca SIN hora, no a la hora esperada", () => {
  // El caso que faltaba: quien no tenia turno se quedaba sin ninguna marca y
  // su dia salia vacio en la tabla. Ahora entra, pero sin hora: `classifyDay`
  // deriva descanso o vacaciones de su propio horario. Ponerle la hora
  // esperada lo marcaria como si hubiera venido a trabajar.
  const plantilla: TurnoDelDia[] = [
    { employeeNumber: "81893", name: "ITZEL", startTime: "10:30", scheduled: "WORKING" },
    { employeeNumber: "95739", name: "WAIRA", startTime: "10:30", scheduled: "OFF" },
    { employeeNumber: "113642", name: "ALONSO", startTime: "10:30", scheduled: "VACATION" }
  ];
  const plan = planPaseDeLista(plantilla, [], new Set(), FECHA);
  const porNumero = new Map(plan.entries.map((e) => [e.employeeNumber, e.arrivedAt]));

  assert.equal(plan.entries.length, 3);
  assert.equal(porNumero.get("81893"), "10:30");
  assert.equal(porNumero.get("95739"), null);
  assert.equal(porNumero.get("113642"), null);
});

test("quien descansa PERO vino se marca con la hora que le pongas", () => {
  // Trabajar en tu descanso es tiempo extra, y hay que poder registrarlo.
  const plantilla: TurnoDelDia[] = [
    { employeeNumber: "95739", name: "WAIRA", startTime: "10:30", scheduled: "OFF" }
  ];
  const plan = planPaseDeLista(plantilla, [{ name: "Waira", arrivedAt: "09:00" }], new Set(), FECHA);

  assert.equal(plan.entries[0].arrivedAt, "09:00");
});

test("el dia de inventario cuenta como trabajado", () => {
  const plantilla: TurnoDelDia[] = [
    { employeeNumber: "1", name: "ITZEL", startTime: "07:00", scheduled: "INVENTORY" }
  ];
  const plan = planPaseDeLista(plantilla, [], new Set(), FECHA);
  assert.equal(plan.entries[0].arrivedAt, "07:00");
});
