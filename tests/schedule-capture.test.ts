import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScheduleEntry } from "../lib/schedule-capture-entry";

const base = { employeeNumber: "95739", date: "2026-08-12", status: "WORKING" };

test("completa dia, semana y etiqueta a partir de la fecha", () => {
  const outcome = normalizeScheduleEntry({ ...base, startTime: "10:00", endTime: "19:00" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  // 12 de agosto de 2026 es miercoles.
  assert.equal(outcome.value.day, "Mie");
  assert.equal(outcome.value.date.toISOString(), "2026-08-12T00:00:00.000Z");
  // La semana arranca en domingo, igual que el importador del Excel.
  assert.equal(outcome.value.weekStart.toISOString(), "2026-08-09T00:00:00.000Z");
  assert.equal(outcome.value.statusRaw, "LABORANDO");
});

test("la fecha se ancla a medianoche UTC", () => {
  // Si la hora variara, `Schedule` guardaria una fila paralela para el mismo dia:
  // la clave unica es (userId, date) y se compara por igualdad exacta.
  const outcome = normalizeScheduleEntry({ ...base, date: "2026-01-01" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.date.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("un dia no laborable no admite horario", () => {
  const outcome = normalizeScheduleEntry({ ...base, status: "OFF", startTime: "10:00", endTime: "19:00" });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /DESCANSO/);
});

test("un dia de descanso sin horas se acepta y guarda su etiqueta", () => {
  const outcome = normalizeScheduleEntry({ ...base, status: "OFF" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.statusRaw, "DESCANSO");
  assert.equal(outcome.value.startTime, null);
  assert.equal(outcome.value.endTime, null);
});

test("el dia de CONTEO si admite horario porque se trabaja", () => {
  const outcome = normalizeScheduleEntry({ ...base, status: "INVENTORY", startTime: "08:00", endTime: "17:00" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.statusRaw, "CONTEO");
  assert.equal(outcome.value.startTime, "08:00");
});

test("rechaza una salida anterior o igual a la entrada", () => {
  const igual = normalizeScheduleEntry({ ...base, startTime: "10:00", endTime: "10:00" });
  assert.equal(igual.ok, false);
  const invertido = normalizeScheduleEntry({ ...base, startTime: "19:00", endTime: "10:00" });
  assert.equal(invertido.ok, false);
});

test("rechaza formatos de hora que no son HH:MM", () => {
  for (const startTime of ["9:00", "24:00", "10:60", "diez"]) {
    const outcome = normalizeScheduleEntry({ ...base, startTime });
    assert.equal(outcome.ok, false, `deberia rechazar ${startTime}`);
  }
});

test("completa las horas vacias con el horario estándar de tienda", () => {
  const outcome = normalizeScheduleEntry({ ...base, startTime: "", endTime: null });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.startTime, "10:30");
  assert.equal(outcome.value.endTime, "21:00");
});

test("completa solo la hora faltante y conserva la capturada", () => {
  const withoutEnd = normalizeScheduleEntry({ ...base, startTime: "12:00" });
  assert.equal(withoutEnd.ok, true);
  if (!withoutEnd.ok) return;
  assert.equal(withoutEnd.value.startTime, "12:00");
  assert.equal(withoutEnd.value.endTime, "21:00");

  const withoutStart = normalizeScheduleEntry({ ...base, endTime: "20:00" });
  assert.equal(withoutStart.ok, true);
  if (!withoutStart.ok) return;
  assert.equal(withoutStart.value.startTime, "10:30");
  assert.equal(withoutStart.value.endTime, "20:00");
});

test("rechaza fechas mal formadas", () => {
  for (const date of ["12-08-2026", "2026/08/12", "2026-8-12", ""]) {
    const outcome = normalizeScheduleEntry({ ...base, date });
    assert.equal(outcome.ok, false, `deberia rechazar ${date}`);
  }
});

test("rechaza un estado que no existe en el enum", () => {
  const outcome = normalizeScheduleEntry({ ...base, status: "LABORANDO" });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  // El panel manda el valor del enum, no la etiqueta en español.
  assert.match(outcome.error, /Estado inv/);
});

test("exige numero de empleado", () => {
  const outcome = normalizeScheduleEntry({ ...base, employeeNumber: "  " });
  assert.equal(outcome.ok, false);
});

test("rechaza un dia que no existe en el calendario", () => {
  // new Date("2026-02-31") no falla: desborda a marzo. Sin la comprobacion, el
  // turno se guardaria en una fecha distinta a la capturada.
  const outcome = normalizeScheduleEntry({ ...base, date: "2026-02-31" });
  assert.equal(outcome.ok, false);
});
