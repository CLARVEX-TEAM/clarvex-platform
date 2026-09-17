import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceDeadlineState,
  axoAttendancePeriodKey,
  isEnergyChecklistDay,
  roleLabel,
  roleOrder
} from "../lib/operational-checklist-reminders";

test("la entrega AXO se identifica por día mediante ReportDelivery", () => {
  assert.equal(axoAttendancePeriodKey("2026-09-16"), "AXO-DIARIO-2026-09-16");
  assert.notEqual(axoAttendancePeriodKey("2026-09-16"), axoAttendancePeriodKey("2026-09-17"));
});

test("el estado vence a las 11:00 y una confirmación siempre prevalece", () => {
  assert.equal(attendanceDeadlineState(10 * 60 + 59, null), "PENDING");
  assert.equal(attendanceDeadlineState(11 * 60, null), "OVERDUE");
  assert.equal(attendanceDeadlineState(15 * 60, new Date("2026-09-16T16:58:00Z")), "CONFIRMED");
});

test("el checklist de energía solo toca lunes, miércoles y viernes", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].filter(isEnergyChecklistDay), [1, 3, 5]);
});

test("la lista del Forms ordena gerencia, subgerencia y asesores", () => {
  const roles = ["ASESOR", "GERENTE", "SUBGERENTE"].sort((a, b) => roleOrder(a) - roleOrder(b));
  assert.deepEqual(roles, ["GERENTE", "SUBGERENTE", "ASESOR"]);
  assert.deepEqual(roles.map(roleLabel), ["Gerente", "Subgerente", "Asesor"]);
});
