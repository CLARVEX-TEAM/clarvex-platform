import assert from "node:assert/strict";
import test from "node:test";
import { classifyArrival, classifyDay, earnsSundayPremium, toMinutes } from "../lib/attendance";

// Horario estándar de la tienda.
const E = "10:30";

test("frontera del retardo: 10:44 aún es a tiempo, 10:45 ya es retardo", () => {
  // La tolerancia es de 14 minutos. Este es EL caso que define nómina.
  assert.equal(classifyArrival({ expected: E, arrived: "10:44" }).status, "ON_TIME");
  assert.equal(classifyArrival({ expected: E, arrived: "10:45" }).status, "LATE");
  assert.equal(classifyArrival({ expected: E, arrived: "10:45" }).minutesLate, 15);
});

test("frontera de la falta: 10:59 es retardo, a las 11:00 se regresan", () => {
  assert.equal(classifyArrival({ expected: E, arrived: "10:59" }).status, "LATE");
  // A partir de +30 min ya no se les deja trabajar: se van a casa = falta.
  assert.equal(classifyArrival({ expected: E, arrived: "11:00" }).status, "ABSENT");
  assert.equal(classifyArrival({ expected: E, arrived: "11:30" }).status, "ABSENT");
});

test("la regla es RELATIVA al horario de cada quien, no a las 11:00 fijas", () => {
  // Quien entra a las 13:00 corre su propia ventana.
  assert.equal(classifyArrival({ expected: "13:00", arrived: "13:14" }).status, "ON_TIME");
  assert.equal(classifyArrival({ expected: "13:00", arrived: "13:15" }).status, "LATE");
  assert.equal(classifyArrival({ expected: "13:00", arrived: "13:30" }).status, "ABSENT");
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
  assert.equal(classifyDay({ scheduled: "WORKING", expected: E, arrived: "11:00" }).status, "ABSENT");
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
