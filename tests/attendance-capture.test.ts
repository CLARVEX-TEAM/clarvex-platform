import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAttendanceEntry } from "../lib/attendance-capture-entry";

const base = { employeeNumber: "95739", date: "2026-08-12" };

test("acepta una jornada completa y ancla la fecha a medianoche UTC", () => {
  const outcome = normalizeAttendanceEntry({
    ...base,
    arrivedAt: "10:28",
    lunchStart: "14:00",
    leftAt: "21:00"
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.date.toISOString(), "2026-08-12T00:00:00.000Z");
  assert.equal(outcome.value.arrivedAt, "10:28");
  assert.equal(outcome.value.leftAt, "21:00");
});

test("acepta un texto de entrada cuando no hubo hora", () => {
  const outcome = normalizeAttendanceEntry({ ...base, entryText: "vacaciones" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  // El texto es un token cerrado: se guarda normalizado en mayusculas.
  assert.equal(outcome.value.entryText, "VACACIONES");
  assert.equal(outcome.value.arrivedAt, null);
});

test("rechaza hora de entrada junto con texto de entrada", () => {
  // O vino, o no vino. Las dos cosas a la vez dejarian el dia sin interpretacion.
  const outcome = normalizeAttendanceEntry({ ...base, arrivedAt: "10:00", entryText: "FALTA" });
  assert.equal(outcome.ok, false);
});

test("rechaza un texto de entrada desconocido", () => {
  const outcome = normalizeAttendanceEntry({ ...base, entryText: "SE FUE TEMPRANO" });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /no reconocido/);
});

test("rechaza salida anterior o igual a la entrada", () => {
  assert.equal(normalizeAttendanceEntry({ ...base, arrivedAt: "10:00", leftAt: "10:00" }).ok, false);
  assert.equal(normalizeAttendanceEntry({ ...base, arrivedAt: "18:00", leftAt: "09:00" }).ok, false);
});

test("rechaza horas que no son HH:MM", () => {
  for (const arrivedAt of ["9:00", "24:00", "10:75", "manana"]) {
    assert.equal(normalizeAttendanceEntry({ ...base, arrivedAt }).ok, false, `deberia rechazar ${arrivedAt}`);
  }
});

test("la nota conserva mayusculas y minusculas", () => {
  const outcome = normalizeAttendanceEntry({ ...base, arrivedAt: "10:00", note: "Llego tarde por el trafico" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.note, "Llego tarde por el trafico");
});

test("rechaza un dia que no existe en el calendario", () => {
  const outcome = normalizeAttendanceEntry({ ...base, date: "2026-02-31" });
  assert.equal(outcome.ok, false);
});

test("una fila vacia es valida: significa que no marco nada", () => {
  // El importador tambien registra dias sin marca; el estado lo decide
  // classifyDay a partir del horario, no esta capa.
  const outcome = normalizeAttendanceEntry({ ...base });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.value.arrivedAt, null);
  assert.equal(outcome.value.entryText, null);
});
