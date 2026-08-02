import { test } from "node:test";
import assert from "node:assert/strict";
import { isCeiling, metricAchievement, metricStatus, metricStatusText } from "../lib/kpi-view";

test("alcance contra la meta", async (t) => {
  await t.test("es el valor dividido entre la meta, en porcentaje", () => {
    assert.equal(metricAchievement(1.8, 1.7), 106);
    assert.equal(metricAchievement(1.7, 1.7), 100);
    assert.equal(metricAchievement(1.4, 1.7), 82);
  });

  await t.test("sin valor o sin meta es null, nunca 0", () => {
    // Un 0% diria que no se vendio nada; lo que pasa es que no hay con que
    // comparar. La interfaz lo pinta «—».
    assert.equal(metricAchievement(null, 1.7), null);
    assert.equal(metricAchievement(1.8, null), null);
    assert.equal(metricAchievement(1.8, 0), null, "no se divide entre cero");
  });

  await t.test("un valor de cero con meta SI es 0%", () => {
    assert.equal(metricAchievement(0, 1.7), 0);
  });
});

/**
 * El Margen DTO no es una meta: es un TECHO de descuento. Antes usaba el mismo
 * semáforo que los demás y se pintaba VERDE justo cuando se excedía el límite.
 */
test("indicadores de techo (margen DTO)", async (t) => {
  await t.test("el margen es techo; los demás no", () => {
    assert.equal(isCeiling("margen"), true);
    assert.equal(isCeiling("upt"), false);
    assert.equal(isCeiling("conversion"), false);
  });

  await t.test("por debajo del límite es verde, por encima rojo", () => {
    assert.equal(metricStatus(8, 12, "margen"), "green", "descontar menos del techo esta bien");
    assert.equal(metricStatus(14, 12, "margen"), "red", "pasarse del techo esta MAL");
  });

  await t.test("avisa en amarillo antes de pasarse", () => {
    assert.equal(metricStatus(11, 12, "margen"), "yellow", "roza el limite: se puede corregir");
  });

  await t.test("en un indicador normal la comparación es la contraria", () => {
    assert.equal(metricStatus(14, 12, "conversion"), "green");
    assert.equal(metricStatus(8, 12, "conversion"), "red");
    assert.equal(metricStatus(11, 12, "conversion"), "yellow");
  });

  await t.test("el texto también cambia: límite, no meta", () => {
    assert.equal(metricStatusText("green", "margen"), "dentro del límite");
    assert.equal(metricStatusText("red", "margen"), "fuera del límite");
    assert.equal(metricStatusText("green", "upt"), "sobre la meta");
    assert.equal(metricStatusText("none", "upt"), "sin meta definida");
  });
});
