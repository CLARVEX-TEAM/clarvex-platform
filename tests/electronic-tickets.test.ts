import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureDenominator,
  captureRate,
  monthTotals,
  qualifiesForRanking,
  validateCapture,
  weekLabel,
  MIN_TICKETS_FOR_RANKING
} from "../lib/electronic-tickets";

const row = (over: Partial<Parameters<typeof captureRate>[0]> = {}) => ({
  rdvTransactions: 100,
  posTransactions: null,
  crmTransactions: 40,
  ...over
});

test("denominador de la tasa", async (t) => {
  await t.test("por omisión manda el RDV, que ya se sincroniza solo", () => {
    assert.equal(captureDenominator(row()), 100);
  });

  await t.test("si gerencia capturó el del POS, ese manda", () => {
    // Numerador y denominador tienen que venir de la misma fuente o la tasa miente.
    assert.equal(captureDenominator(row({ posTransactions: 90 })), 90);
  });

  await t.test("un POS en cero es un dato, no una ausencia", () => {
    assert.equal(captureDenominator(row({ posTransactions: 0 })), 0);
  });
});

test("tasa de captura", async (t) => {
  await t.test("calcula sobre el denominador vigente", () => {
    assert.equal(captureRate(row()), 0.4);
    assert.equal(captureRate(row({ posTransactions: 80 })), 0.5);
  });

  await t.test("sin captura devuelve null, no cero", () => {
    // Regla del proyecto: si no hay dato se pinta «—». Un 0% diria que el asesor
    // no capturo ninguno, que es una acusacion distinta a «no lo hemos medido».
    assert.equal(captureRate(row({ crmTransactions: null })), null);
  });

  await t.test("sin tickets no hay tasa: no se divide entre cero", () => {
    assert.equal(captureRate(row({ rdvTransactions: 0 })), null);
    assert.equal(captureRate(row({ rdvTransactions: 0, posTransactions: 0 })), null);
  });

  await t.test("cero capturas con tickets SÍ es 0%", () => {
    assert.equal(captureRate(row({ crmTransactions: 0 })), 0);
  });
});

test("validación antes de guardar", async (t) => {
  await t.test("más electrónicos que totales se rechaza", () => {
    assert.equal(validateCapture(row({ crmTransactions: 101 })), "excede");
  });

  await t.test("justo iguales se acepta: capturar el 100% es posible", () => {
    assert.equal(validateCapture(row({ crmTransactions: 100 })), null);
  });

  await t.test("se compara contra el denominador vigente, no siempre el RDV", () => {
    // 95 cabe en los 100 del RDV pero NO en los 90 del POS.
    assert.equal(validateCapture(row({ crmTransactions: 95, posTransactions: 90 })), "excede");
  });

  await t.test("vacío no es un error: es una semana sin capturar", () => {
    assert.equal(validateCapture(row({ crmTransactions: null })), null);
  });
});

test("piso del ranking", async (t) => {
  await t.test("con pocos tickets no entra: 3 de 3 no es el mejor del equipo", () => {
    assert.equal(qualifiesForRanking(row({ rdvTransactions: 3, crmTransactions: 3 })), false);
  });

  await t.test("desde el mínimo sí entra", () => {
    assert.equal(qualifiesForRanking(row({ rdvTransactions: MIN_TICKETS_FOR_RANKING, crmTransactions: 5 })), true);
  });

  await t.test("sin captura no entra aunque tenga tickets de sobra", () => {
    assert.equal(qualifiesForRanking(row({ rdvTransactions: 500, crmTransactions: null })), false);
  });
});

test("total del mes", async (t) => {
  await t.test("suma las semanas capturadas e ignora las vacías", () => {
    const total = monthTotals([
      row({ rdvTransactions: 100, crmTransactions: 40 }),
      row({ rdvTransactions: 100, crmTransactions: 60 }),
      row({ rdvTransactions: 100, crmTransactions: null })
    ]);
    assert.equal(total.crm, 100);
    // La tercera semana NO suma sus 100 tickets: incluirla hundiria la tasa
    // fingiendo que se capturaron cero cuando en realidad no se ha medido.
    assert.equal(total.tickets, 200);
    assert.equal(total.rate, 0.5);
  });

  await t.test("sin nada capturado la tasa es null", () => {
    const total = monthTotals([row({ crmTransactions: null })]);
    assert.equal(total.rate, null);
    assert.equal(total.tickets, 0);
  });
});

/**
 * Descubierto al verificar en producción: en la tabla `Kpi` los campos
 * `weekStart` y `weekEnd` valen LO MISMO que `date` en cada fila. No son los
 * límites de la semana, pese al nombre.
 *
 * Agrupar por `weekStart` produciría una "semana" por día. Lo correcto es
 * `weekNumber`, que sí es constante dentro de la semana y es lo que ya usa la
 * sincronización del margen DTO. Esta prueba deja el hallazgo por escrito.
 */
test("agrupar semanas: weekNumber, nunca weekStart", async (t) => {
  const filas = [
    { date: "2026-07-27", weekStart: "2026-07-27", weekNumber: 30 },
    { date: "2026-07-28", weekStart: "2026-07-28", weekNumber: 30 },
    { date: "2026-07-29", weekStart: "2026-07-29", weekNumber: 30 }
  ];

  await t.test("weekStart NO es constante dentro de una semana", () => {
    const porWeekStart = new Set(filas.map((fila) => fila.weekStart));
    assert.equal(porWeekStart.size, 3, "tres 'semanas' distintas para tres días de la MISMA semana");
  });

  await t.test("weekNumber sí lo es", () => {
    const porWeekNumber = new Set(filas.map((fila) => fila.weekNumber));
    assert.equal(porWeekNumber.size, 1, "una sola semana, que es la verdad");
  });

  await t.test("los límites reales se derivan del mínimo y máximo date", () => {
    const fechas = filas.map((fila) => fila.date).sort();
    assert.equal(fechas[0], "2026-07-27");
    assert.equal(fechas[fechas.length - 1], "2026-07-29");
  });
});

test("etiqueta de la semana", async (t) => {
  await t.test("dentro del mismo mes no repite el mes", () => {
    const label = weekLabel(31, new Date("2026-07-05T00:00:00Z"), new Date("2026-07-11T00:00:00Z"));
    assert.equal(label, "Sem 31 · 5–11 jul");
  });

  await t.test("a caballo entre dos meses los nombra los dos", () => {
    const label = weekLabel(31, new Date("2026-07-26T00:00:00Z"), new Date("2026-08-01T00:00:00Z"));
    assert.equal(label, "Sem 31 · 26 jul – 1 ago");
  });
});
