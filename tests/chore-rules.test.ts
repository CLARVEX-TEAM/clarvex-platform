import assert from "node:assert/strict";
import test from "node:test";
import { assignChores, choreTitle, choresForWeekday, weekdayOf, type Counts } from "../lib/chore-rules";

test("weekdayOf usa UTC: lunes=1, miércoles=3, sábado=6", () => {
  assert.equal(weekdayOf("2026-06-15"), 1); // lunes
  assert.equal(weekdayOf("2026-06-17"), 3); // miércoles
  assert.equal(weekdayOf("2026-06-20"), 6); // sábado
});

test("tareas aplicables por día", () => {
  const lunes = choresForWeekday(1).map((c) => c.key);
  assert.deepEqual(lunes.sort(), ["BARRER_MOPEAR", "CICLICO", "VISUAL"].sort());

  const martes = choresForWeekday(2).map((c) => c.key);
  assert.deepEqual(martes.sort(), ["BARRER_MOPEAR", "CICLICO", "TRAPEAR", "VIDRIOS", "VISUAL"].sort());

  const viernes = choresForWeekday(5).map((c) => c.key);
  assert.deepEqual(viernes.sort(), ["BARRER_MOPEAR"].sort());

  const domingo = choresForWeekday(0).map((c) => c.key);
  assert.deepEqual(domingo, ["BARRER_MOPEAR"]);
});

test("el cíclico no aplica viernes/sábado/domingo", () => {
  for (const d of [5, 6, 0]) {
    assert.equal(choresForWeekday(d).some((c) => c.key === "CICLICO"), false);
  }
});

test("visual es compartida (todos los que trabajan) lun-mié", () => {
  const result = assignChores({ workingAdvisorIds: ["a", "b"], weekday: 1, counts: {} });
  assert.deepEqual(result.shared, ["VISUAL"]);
  // visual no se asigna como rotativa
  assert.equal(result.rotating.VISUAL, undefined);
});

test("el miércoles la actividad de visual incluye la entrega del RF", () => {
  assert.match(choreTitle("VISUAL", 3), /RF/);
  assert.doesNotMatch(choreTitle("VISUAL", 1), /RF/);
});

test("reparto: con varias tareas el mismo día no se acumulan en un solo asesor si hay alternativa", () => {
  // martes con 4 tareas rotativas (cíclico, trapear, vidrios, barrer) y 4 asesores → uno por cabeza
  const result = assignChores({ workingAdvisorIds: ["a", "b", "c", "d"], weekday: 2, counts: {} });
  const asignados = Object.values(result.rotating);
  assert.equal(asignados.length, 4);
  assert.equal(new Set(asignados).size, 4); // todos distintos
});

test("rotación justa: elige a quien tiene menor conteo histórico de esa tarea", () => {
  const counts: Counts = { CICLICO: { a: 3, b: 1, c: 2 } };
  const result = assignChores({ workingAdvisorIds: ["a", "b", "c"], weekday: 1, counts });
  assert.equal(result.rotating.CICLICO, "b");
});

test("compensación del doble cíclico: quien hizo de más se salta hasta que los demás emparejen", () => {
  // 'a' hizo doble (2), 'b' y 'c' hicieron 1 → el siguiente cíclico NO es 'a'
  const counts: Counts = { CICLICO: { a: 2, b: 1, c: 1 } };
  const result = assignChores({ workingAdvisorIds: ["a", "b", "c"], weekday: 1, counts });
  assert.notEqual(result.rotating.CICLICO, "a");
});

test("respeta descansos: solo reparte entre los que trabajan", () => {
  const result = assignChores({ workingAdvisorIds: ["b"], weekday: 1, counts: { CICLICO: { b: 9 } } });
  // aunque 'b' tenga conteo alto, es el único que trabaja → le toca
  assert.equal(result.rotating.CICLICO, "b");
});
