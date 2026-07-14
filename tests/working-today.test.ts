import assert from "node:assert/strict";
import test from "node:test";
import { isRestingToday, scheduleStatusByUser } from "../lib/working-today";

const HOY = "2026-07-13"; // lunes
const ALONSO = "user-alonso";
const JAZMIN = "user-jazmin";

test("el horario manda sobre la meta del RDV (bug del ranking)", () => {
  // Caso real: se intercambiaron los descansos. Horarios dice que Alonso
  // descansa el lunes, pero el RDV (otro archivo) todavía le asigna meta.
  const shifts = [
    { userId: ALONSO, date: HOY, status: "OFF" },
    { userId: JAZMIN, date: HOY, status: "WORKING" }
  ];
  const status = scheduleStatusByUser(shifts, HOY);

  // Antes: meta > 0 => "trabaja" => Alonso salía en el podio. Ahora descansa.
  assert.equal(isRestingToday(status.get(ALONSO), { dailyGoal: 12_000 }), true);
  assert.equal(isRestingToday(status.get(JAZMIN), { dailyGoal: 12_000 }), false);
});

test("otros estados de no-laborando también cuentan como descanso", () => {
  assert.equal(isRestingToday("VACATION", { dailyGoal: 12_000 }), true);
  assert.equal(isRestingToday("PAID_DAY", { dailyGoal: 12_000 }), true);
  assert.equal(isRestingToday("INVENTORY", { dailyGoal: 12_000 }), true);
  assert.equal(isRestingToday("TERMINATED", { dailyGoal: 12_000 }), true);
  assert.equal(isRestingToday("WORKING", { dailyGoal: 0 }), false);
});

test("sin horario cargado: cae al heurístico viejo de la meta del RDV", () => {
  // Tiendas que aún no vinculan el archivo de horarios deben seguir funcionando.
  assert.equal(isRestingToday(undefined, { dailyGoal: 12_000 }), false);
  assert.equal(isRestingToday(undefined, { dailyGoal: 0 }), true);
  assert.equal(isRestingToday(undefined, undefined), true);
  assert.equal(isRestingToday(undefined, { dailyGoal: null }), true);
});

test("solo se consideran los turnos del día consultado", () => {
  const shifts = [
    { userId: ALONSO, date: "2026-07-12", status: "WORKING" }, // ayer
    { userId: ALONSO, date: HOY, status: "OFF" }
  ];
  const status = scheduleStatusByUser(shifts, HOY);
  assert.equal(status.get(ALONSO), "OFF");
  assert.equal(status.size, 1);
});
