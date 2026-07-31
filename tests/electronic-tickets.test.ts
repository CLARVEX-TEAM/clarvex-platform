import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureDenominator,
  captureRate,
  monthTotals,
  qualifiesForRanking,
  validateCapture,
  weekLabel,
  MIN_TICKETS_FOR_RANKING,
  reportedRate,
  rateStatus,
  sumTickets,
  targetForRole,
  targetValue,
  formatRate
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

test("tasa del reporte", async (t) => {
  await t.test("divide entre el denominador congelado, no entre todos los tickets", () => {
    // El denominador cubre SOLO las semanas capturadas. Si se dividiera entre
    // los tickets de todo el mes, una semana sin medir hundiría la tasa.
    assert.equal(reportedRate({ crmTransactions: 42, posTransactions: 100 }), 42);
  });

  await t.test("sin captura devuelve null, no cero", () => {
    assert.equal(reportedRate({ crmTransactions: null, posTransactions: 100 }), null);
    assert.equal(reportedRate(null), null);
  });

  await t.test("denominador en cero no revienta", () => {
    assert.equal(reportedRate({ crmTransactions: 5, posTransactions: 0 }), null);
  });
});

test("meta según el rol", async (t) => {
  await t.test("el asesor va contra la suya y gerencia contra la de tienda", () => {
    assert.equal(targetForRole("ASESOR", 80, 60), 60);
    assert.equal(targetForRole("GERENTE", 80, 60), 80);
    assert.equal(targetForRole("SUBGERENTE", 80, 60), 80);
  });
});

test("estado contra la meta", async (t) => {
  await t.test("igualar la meta ya es cumplir", () => {
    assert.equal(rateStatus(60, 60), "cumple");
    assert.equal(rateStatus(75, 60), "cumple");
  });

  await t.test("a menos de 5 puntos es «cerca», no rojo", () => {
    // Un rojo que sale siempre deja de leerse en piso.
    assert.equal(rateStatus(56, 60), "cerca");
    assert.equal(rateStatus(55, 60), "cerca");
    assert.equal(rateStatus(54.9, 60), "abajo");
  });

  await t.test("sin dato y sin meta se distinguen", () => {
    assert.equal(rateStatus(null, 60), "sin-dato");
    assert.equal(rateStatus(50, null), "sin-meta");
    assert.equal(rateStatus(50, 0), "sin-meta");
  });
});

test("suma de renglones", async (t) => {
  await t.test("ignora a quien no tiene captura", () => {
    const total = sumTickets([
      { crmTransactions: 30, posTransactions: 100 },
      { crmTransactions: 50, posTransactions: 100 },
      { crmTransactions: null, posTransactions: 200 }
    ]);
    assert.equal(total.crmTransactions, 80);
    // Los 200 del tercero NO entran: no se ha medido, no es un cero.
    assert.equal(total.posTransactions, 200);
    assert.equal(reportedRate(total), 40);
  });

  await t.test("si nadie capturó, el total es null", () => {
    assert.equal(sumTickets([{ crmTransactions: null, posTransactions: 10 }]).crmTransactions, null);
  });
});

test("lectura de metas y formato", async (t) => {
  const targets = [{ metric: "ticketElectronicoTienda", value: 80 }, { metric: "upt", value: 1.7 }];

  await t.test("encuentra la meta y devuelve null si no está puesta", () => {
    assert.equal(targetValue(targets, "ticketElectronicoTienda"), 80);
    assert.equal(targetValue(targets, "ticketElectronicoAsesor"), null);
  });

  await t.test("formatea con un decimal y «—» cuando no hay dato", () => {
    assert.equal(formatRate(42.35), "42.4%");
    assert.equal(formatRate(null), "—");
    assert.equal(formatRate(0), "0.0%", "cero capturado SÍ es cero");
  });
});
