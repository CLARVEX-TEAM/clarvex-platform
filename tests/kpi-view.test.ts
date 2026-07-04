import assert from "node:assert/strict";
import test from "node:test";
import { computeMonthWeeks, formatWeeksElapsed, type KpiResponse } from "../lib/kpi-view";

// Reporte mínimo de mes retail: junio 2026 con 4 semanas detectadas
// (31 may – 27 jun). La semana 5 real (28 jun – 4 jul) aún no aparece en el RDV.
function monthReport(overrides: Partial<KpiResponse> = {}): KpiResponse {
  return {
    period: "month",
    selectedDate: "2026-06-01",
    startDate: "2026-05-31",
    endDate: "2026-06-27",
    weekNumber: null,
    availableWeeks: [
      { weekNumber: 23, weekStart: "2026-05-31", weekEnd: "2026-06-06" },
      { weekNumber: 24, weekStart: "2026-06-07", weekEnd: "2026-06-13" },
      { weekNumber: 25, weekStart: "2026-06-14", weekEnd: "2026-06-20" },
      { weekNumber: 26, weekStart: "2026-06-21", weekEnd: "2026-06-27" }
    ],
    availableRetailMonths: [{ label: "Junio 2026", start: "2026-05-31", end: "2026-06-27" }],
    retailMonthLabel: "Junio 2026",
    workedDays: null,
    currentUserId: "u1",
    role: "GERENTE",
    store: null,
    own: null,
    team: [],
    hasDiscountSource: false,
    latestDiscountWeek: null,
    commissionRules: [],
    ...overrides
  } as unknown as KpiResponse;
}

test("mes en curso: la semana a medias cuenta como fracción de días", () => {
  // 17 jun = día 18 del mes retail → 18/7 semanas transcurridas.
  const result = computeMonthWeeks(monthReport(), new Date("2026-06-17T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 18 / 7, totalWeeks: 4 });
});

test("primeros días del mes: piso de 1 semana para no extrapolar salvaje", () => {
  const result = computeMonthWeeks(monthReport(), new Date("2026-06-02T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 1, totalWeeks: 4 });
});

test("quinta semana sin detectar: proyecta con la fracción en lugar de apagarse", () => {
  // Hoy 1 jul: después del fin detectado (27 jun) pero dentro de la semana
  // siguiente → día 32 de 35 del mes extendido a 5 semanas.
  const result = computeMonthWeeks(monthReport(), new Date("2026-07-01T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 32 / 7, totalWeeks: 5 });
});

test("quinta semana sin detectar: el último día de la semana 5 sigue proyectando", () => {
  // 3 jul = end + 6 días, todavía dentro de la semana inmediata posterior.
  const result = computeMonthWeeks(monthReport(), new Date("2026-07-03T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 34 / 7, totalWeeks: 5 });
});

test("mes realmente terminado: si otro mes retail contiene hoy, no proyecta el viejo", () => {
  const report = monthReport({
    availableRetailMonths: [
      { label: "Junio 2026", start: "2026-05-31", end: "2026-06-27" },
      { label: "Julio 2026", start: "2026-06-28", end: "2026-08-01" }
    ]
  });
  assert.equal(computeMonthWeeks(report, new Date("2026-07-01T12:00:00Z")), null);
});

test("más de una semana después del fin detectado: no inventa proyección", () => {
  assert.equal(computeMonthWeeks(monthReport(), new Date("2026-07-05T12:00:00Z")), null);
});

test("mes de 5 semanas ya detectadas completo: fuera de rango no proyecta", () => {
  const report = monthReport({
    endDate: "2026-07-04",
    availableWeeks: [
      { weekNumber: 23, weekStart: "2026-05-31", weekEnd: "2026-06-06" },
      { weekNumber: 24, weekStart: "2026-06-07", weekEnd: "2026-06-13" },
      { weekNumber: 25, weekStart: "2026-06-14", weekEnd: "2026-06-20" },
      { weekNumber: 26, weekStart: "2026-06-21", weekEnd: "2026-06-27" },
      { weekNumber: 27, weekStart: "2026-06-28", weekEnd: "2026-07-04" }
    ]
  });
  // Dentro de la semana 5 detectada: día 32 de 35 → sigue extrapolando.
  assert.deepEqual(computeMonthWeeks(report, new Date("2026-07-01T12:00:00Z")), { weeksElapsed: 32 / 7, totalWeeks: 5 });
  // Último día del mes: 35/35 → la proyección es la venta real.
  assert.deepEqual(computeMonthWeeks(report, new Date("2026-07-04T12:00:00Z")), { weeksElapsed: 5, totalWeeks: 5 });
  // Después del fin de un mes de 5 semanas: nunca se extiende a 6.
  assert.equal(computeMonthWeeks(report, new Date("2026-07-06T12:00:00Z")), null);
});

test("formatWeeksElapsed: entero exacto o un decimal", () => {
  assert.equal(formatWeeksElapsed(4), "4");
  assert.equal(formatWeeksElapsed(34 / 7), "4.9");
  assert.equal(formatWeeksElapsed(18 / 7), "2.6");
});

test("antes de que empiece el mes: no proyecta", () => {
  assert.equal(computeMonthWeeks(monthReport(), new Date("2026-05-30T12:00:00Z")), null);
});
