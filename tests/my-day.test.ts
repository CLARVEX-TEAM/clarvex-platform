import test from "node:test";
import assert from "node:assert/strict";
import { attendanceLabel, correctionStatusLabel, progressPercent, shiftSummary } from "../lib/my-day";

test("progressPercent limita el avance al rango visible", () => {
  assert.equal(progressPercent(500, 1000), 50);
  assert.equal(progressPercent(1500, 1000), 100);
  assert.equal(progressPercent(-10, 1000), 0);
  assert.equal(progressPercent(100, 0), 0);
});

test("shiftSummary distingue jornada, descanso y horario faltante", () => {
  assert.equal(shiftSummary(null), "Horario pendiente de cargar");
  assert.equal(shiftSummary({ status: "OFF", start: null, end: null, zone: null }), "Día de descanso");
  assert.equal(shiftSummary({ status: "WORKING", start: "10:30", end: "21:00", zone: "Piso" }), "10:30–21:00 · Piso");
});

test("las etiquetas de asistencia y corrección son comprensibles", () => {
  assert.equal(attendanceLabel(null), "Sin registro de entrada");
  assert.equal(attendanceLabel({ status: "LATE", expectedAt: "10:30", arrivedAt: "10:42", expectedLeaveAt: "21:00", leftAt: null, minutesLate: 12 }), "Retardo registrado");
  assert.equal(correctionStatusLabel("PENDING"), "En revisión");
  assert.equal(correctionStatusLabel("APPROVED"), "Aprobada");
  assert.equal(correctionStatusLabel("REJECTED"), "No aprobada");
});
