import assert from "node:assert/strict";
import test from "node:test";
import { classifyArrival, classifyDay, countsAsLate, earnsSundayPremium, toMinutes } from "../lib/attendance";
import { dayBalanceMinutes } from "../lib/hours-balance";

// Horario estándar de la tienda.
const E = "10:30";

test("frontera del retardo: 10:44 aún es a tiempo, 10:45 ya es retardo", () => {
  // La tolerancia es de 14 minutos. Este es EL caso que define nómina.
  assert.equal(classifyArrival({ expected: E, arrived: "10:44" }).status, "ON_TIME");
  assert.equal(classifyArrival({ expected: E, arrived: "10:45" }).status, "LATE");
  assert.equal(classifyArrival({ expected: E, arrived: "10:45" }).minutesLate, 15);
});

test("frontera del permiso: 10:59 es retardo, desde las 11:00 usa banco de horas", () => {
  assert.equal(classifyArrival({ expected: E, arrived: "10:59" }).status, "LATE");
  assert.equal(classifyArrival({ expected: E, arrived: "11:00" }).status, "EXCUSED");
  assert.equal(classifyArrival({ expected: E, arrived: "11:30" }).status, "EXCUSED");
  assert.equal(dayBalanceMinutes({ status: "EXCUSED", expectedEntry: E, expectedExit: "21:00", arrivedAt: "11:00", leftAt: "21:00" }), -30);
  assert.equal(dayBalanceMinutes({ status: "EXCUSED", expectedEntry: E, expectedExit: "21:00", arrivedAt: "12:00", leftAt: "21:00" }), -90);
});

test("la regla es RELATIVA al horario de cada quien, no a las 11:00 fijas", () => {
  // Quien entra a las 13:00 corre su propia ventana.
  assert.equal(classifyArrival({ expected: "13:00", arrived: "13:14" }).status, "ON_TIME");
  assert.equal(classifyArrival({ expected: "13:00", arrived: "13:15" }).status, "LATE");
  assert.equal(classifyArrival({ expected: "13:00", arrived: "13:30" }).status, "EXCUSED");
  // Y a las 11:00 llegaría dos horas ANTES: eso no es retardo.
  assert.equal(classifyArrival({ expected: "13:00", arrived: "11:00" }).status, "ON_TIME");
});

test("llegar temprano nunca es retardo", () => {
  const result = classifyArrival({ expected: E, arrived: "08:30" });
  assert.equal(result.status, "ON_TIME");
  assert.equal(result.minutesLate, -120); // negativo: se adelantó 2 h
});

test("sin marca de entrada = falta", () => {
  assert.equal(classifyArrival({ expected: E, arrived: null }).status, "ABSENT");
});

test("un permiso de entrar tarde aprobado no cuenta como retardo ni falta", () => {
  assert.equal(classifyArrival({ expected: E, arrived: "11:45", excused: true }).status, "EXCUSED");
  // Incluso si no llegó a marcar: el permiso manda.
  assert.equal(classifyArrival({ expected: E, arrived: null, excused: true }).status, "EXCUSED");
});

test("prima dominical: la gana quien TRABAJÓ el domingo", () => {
  const domingo = new Date("2026-07-12T00:00:00.000Z");
  const lunes = new Date("2026-07-13T00:00:00.000Z");

  assert.equal(earnsSundayPremium("ON_TIME", domingo), true);
  assert.equal(earnsSundayPremium("LATE", domingo), true); // llegó tarde, pero trabajó
  assert.equal(earnsSundayPremium("ABSENT", domingo), false); // no se presentó
  assert.equal(earnsSundayPremium("REST", domingo), false); // descansó
  assert.equal(earnsSundayPremium("ON_TIME", lunes), false); // no es domingo
});

// ── Cruce con el horario: lo que evita faltas falsas ──────────────────────────

test("quien DESCANSA no lleva falta aunque su fila esté vacía", () => {
  // Caso real: el 13-jul-2026 Alonso descansaba. En la hoja APERTURA su celda de
  // entrada está VACÍA — igual que la de alguien que no se presentó. Sin cruzar
  // con el horario, se le anotaría una FALTA que iría a nómina.
  const result = classifyDay({ scheduled: "OFF", expected: E, arrived: null });
  assert.equal(result.status, "REST");

  // Y quien SÍ tenía que trabajar y no llegó, esa sí es falta.
  assert.equal(classifyDay({ scheduled: "WORKING", expected: E, arrived: null }).status, "ABSENT");
});

test("vacaciones, pago de día y conteo tampoco son faltas", () => {
  assert.equal(classifyDay({ scheduled: "VACATION", expected: E, arrived: null }).status, "VACATION");
  assert.equal(classifyDay({ scheduled: "PAID_DAY", expected: E, arrived: null }).status, "PAID_DAY");
  assert.equal(classifyDay({ scheduled: "INVENTORY", expected: E, arrived: null }).status, "INVENTORY");
});

test("el texto escrito en la celda manda sobre el horario", () => {
  // Si gerencia escribió "FALTA", es falta aunque el horario dijera que descansaba.
  assert.equal(classifyDay({ scheduled: "OFF", expected: E, arrived: null, entryText: "FALTA" }).status, "ABSENT");
  // Y "VACACIONES" en la celda se respeta aunque el horario no lo supiera.
  assert.equal(classifyDay({ scheduled: "WORKING", expected: E, arrived: null, entryText: "VACACIONES" }).status, "VACATION");
});

test("con horario de trabajo, la llegada se juzga normal", () => {
  assert.equal(classifyDay({ scheduled: "WORKING", expected: E, arrived: "10:37" }).status, "ON_TIME");
  assert.equal(classifyDay({ scheduled: "WORKING", expected: E, arrived: "10:45" }).status, "LATE");
  assert.equal(classifyDay({ scheduled: "WORKING", expected: E, arrived: "11:00" }).status, "EXCUSED");
});

test("en CONTEO la llegada tarde es retardo, no una deuda de horas", () => {
  // Caso real: 4-ago-2026, día de conteo. Jazmín entró 10:47 (17 min tarde) y la
  // app no le puso retardo — le cobró −0:17 al banco de horas. El conteo es día
  // laborable: hasta el corte se juzga igual que cualquier otro día.
  const jazmin = classifyDay({ scheduled: "INVENTORY", expected: E, arrived: "10:47" });
  assert.equal(jazmin.status, "INVENTORY");
  assert.equal(jazmin.minutesLate, 17);
  assert.equal(countsAsLate(jazmin), true);
  // Y no se le cobra dos veces: el banco no se mueve.
  assert.equal(dayBalanceMinutes({ status: "INVENTORY", expectedEntry: E, expectedExit: "21:00", arrivedAt: "10:47", leftAt: "21:00" }), 0);

  // Dentro de la tolerancia sigue sin ser nada.
  const puntual = classifyDay({ scheduled: "INVENTORY", expected: E, arrived: "10:42" });
  assert.equal(countsAsLate(puntual), false);

  // Pasado el corte NO es falta (en conteo nadie se regresa a casa) y tampoco
  // retardo: es jornada acordada y se descuenta del banco. Itzel entró 13:00.
  const itzel = classifyDay({ scheduled: "INVENTORY", expected: E, arrived: "13:00" });
  assert.equal(itzel.status, "INVENTORY");
  assert.equal(countsAsLate(itzel), false);
  assert.equal(dayBalanceMinutes({ status: "INVENTORY", expectedEntry: E, expectedExit: "21:00", arrivedAt: "13:00", leftAt: "21:00" }), -150);
});

test("el retardo de un día normal nunca toca el banco de horas", () => {
  // Contraste con el conteo: 3-ago Jazmín entró 10:56 y quedó LATE con banco en 0.
  assert.equal(dayBalanceMinutes({ status: "LATE", expectedEntry: E, expectedExit: "21:00", arrivedAt: "10:56", leftAt: "21:00" }), 0);
});

test("sin horario cargado se juzga solo por la llegada (no se inventa descanso)", () => {
  assert.equal(classifyDay({ scheduled: null, expected: E, arrived: "10:45" }).status, "LATE");
  assert.equal(classifyDay({ scheduled: null, expected: E, arrived: null }).status, "ABSENT");
});

test("toMinutes valida la hora", () => {
  assert.equal(toMinutes("10:45"), 645);
  assert.equal(toMinutes("8:05"), 485);
  assert.equal(toMinutes("25:00"), null);
  assert.equal(toMinutes("VACACIONES"), null);
  assert.equal(toMinutes(null), null);
});
