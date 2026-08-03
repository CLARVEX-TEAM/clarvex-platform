import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fillWidth, markerPosition, paceLabel, paceStatus, periodElapsed, scaleFor, PACE_BAND
} from "../lib/progress-pace";

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

test("cuánto del periodo ha transcurrido", async (t) => {
  // Mes retail de agosto 2026: 2 al 29, 28 días.
  const start = "2026-08-02";
  const end = "2026-08-29";

  await t.test("el primer día ya cuenta como transcurrido", () => {
    // Si no, a primera hora de la mañana la marca saldría en el punto de ayer y
    // cualquiera pareceria ir por delante.
    assert.equal(periodElapsed(start, end, at("2026-08-02")), 4); // 1 de 28
  });

  await t.test("a mitad de periodo marca la mitad", () => {
    assert.equal(periodElapsed(start, end, at("2026-08-15")), 50); // 14 de 28
  });

  await t.test("el último día marca 100", () => {
    assert.equal(periodElapsed(start, end, at("2026-08-29")), 100);
  });

  await t.test("fuera del periodo no hay ritmo que marcar", () => {
    // Cerrado: la pregunta deja de ser «¿voy a tiempo?» y pasa a ser «¿llegué?».
    assert.equal(periodElapsed(start, end, at("2026-08-30")), null, "ya cerró");
    assert.equal(periodElapsed(start, end, at("2026-08-01")), null, "aún no empieza");
  });

  await t.test("fechas inválidas devuelven null en vez de reventar", () => {
    assert.equal(periodElapsed("no-es-fecha", end, at("2026-08-15")), null);
    assert.equal(periodElapsed(end, start, at("2026-08-15")), null, "fin antes que inicio");
  });
});

/**
 * El caso real que destapó el problema: 33% de cumplimiento a una semana de
 * cuatro. La app lo pintaba ROJO comparándolo contra el 100% del mes completo,
 * cuando en realidad iba por delante: lo esperado a esas alturas era ~25%.
 */
test("estado contra la marca de ritmo", async (t) => {
  await t.test("33% con 25% esperado va POR DELANTE, no en rojo", () => {
    assert.equal(paceStatus(33, 25), "adelante");
  });

  await t.test("dentro de la banda es «en ritmo»", () => {
    assert.equal(paceStatus(50, 50), "en-ritmo");
    assert.equal(paceStatus(50 + PACE_BAND - 1, 50), "en-ritmo");
    assert.equal(paceStatus(50 - PACE_BAND, 50), "en-ritmo");
  });

  await t.test("por debajo de la banda sí es atrás", () => {
    assert.equal(paceStatus(40, 50), "atras");
  });

  await t.test("llegar al 100 es cumplida, aunque falte periodo", () => {
    assert.equal(paceStatus(105, 30), "cumplida");
    assert.equal(paceStatus(100, 99), "cumplida");
  });

  await t.test("sin ritmo (periodo cerrado) se juzga contra el 100", () => {
    assert.equal(paceStatus(95, null), "en-ritmo");
    assert.equal(paceStatus(70, null), "atras");
  });

  await t.test("sin dato no inventa un estado", () => {
    assert.equal(paceStatus(null, 50), "sin-ritmo");
  });

  await t.test("la etiqueta dice el número esperado, no solo un color", () => {
    assert.match(paceLabel(paceStatus(33, 25), 25), /25% esperado/);
    assert.equal(paceLabel("cumplida", 25), "Meta cumplida");
  });
});

/**
 * La barra de proyección de cierre iba SIEMPRE LLENA: la proyección era 130% y
 * se recortaba a 100. Una barra que nunca cambia no informa de nada.
 */
test("escala de la barra cuando se pasa del 100%", async (t) => {
  await t.test("por debajo del 100 la escala es 100: nada cambia", () => {
    assert.equal(scaleFor(33, 25), 100);
    assert.equal(fillWidth(33, 25), 33);
    assert.equal(markerPosition(33, 25), 25);
  });

  await t.test("al 130% el relleno llena y la marca de la meta queda ATRÁS", () => {
    assert.equal(scaleFor(130, 100), 130);
    assert.equal(fillWidth(130, 100), 100);
    const marca = markerPosition(130, 100);
    assert.ok(marca !== null && marca > 76 && marca < 78, `la meta queda en ~77%, no en el borde (fue ${marca})`);
  });

  await t.test("nunca se sale del carril ni con valores absurdos", () => {
    assert.equal(fillWidth(-20, null), 0);
    assert.ok(fillWidth(99999, 100) <= 100);
  });

  await t.test("una marca pegada al borde no se pinta: no se distinguiría", () => {
    assert.equal(markerPosition(50, 100), null, "la meta al 100% con escala 100 es el borde");
    assert.equal(markerPosition(50, 0), null);
    assert.equal(markerPosition(50, null), null, "sin marca no hay nada que pintar");
  });
});
