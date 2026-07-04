import assert from "node:assert/strict";
import test from "node:test";
import { computeMonthWeeks, type KpiResponse } from "../lib/kpi-view";

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

test("mes en curso: cuenta semanas transcurridas y totales", () => {
  const result = computeMonthWeeks(monthReport(), new Date("2026-06-17T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 3, totalWeeks: 4 });
});

test("quinta semana sin detectar: proyecta 4 de 5 en lugar de apagarse", () => {
  // Hoy 1 jul: después del fin detectado (27 jun) pero dentro de la semana siguiente.
  const result = computeMonthWeeks(monthReport(), new Date("2026-07-01T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 4, totalWeeks: 5 });
});

test("quinta semana sin detectar: el último día de la semana 5 sigue proyectando", () => {
  // 3 jul = end + 6 días, todavía dentro de la semana inmediata posterior.
  const result = computeMonthWeeks(monthReport(), new Date("2026-07-03T12:00:00Z"));
  assert.deepEqual(result, { weeksElapsed: 4, totalWeeks: 5 });
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
  // Dentro de la semana 5 detectada: 5 de 5.
  assert.deepEqual(computeMonthWeeks(report, new Date("2026-07-01T12:00:00Z")), { weeksElapsed: 5, totalWeeks: 5 });
  // Después del fin de un mes de 5 semanas: nunca se extiende a 6.
  assert.equal(computeMonthWeeks(report, new Date("2026-07-06T12:00:00Z")), null);
});

test("antes de que empiece el mes: no proyecta", () => {
  assert.equal(computeMonthWeeks(monthReport(), new Date("2026-05-30T12:00:00Z")), null);
});
