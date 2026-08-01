import { test } from "node:test";
import assert from "node:assert/strict";
import {
  climateIndex, indexLevel, isSplit, ratingLevel, responseRate, spread, worstQuestions,
  AUDIENCE_LABEL
} from "../lib/survey-climate";

test("índice de clima", async (t) => {
  await t.test("reescala 1–5 a 0–100: el mínimo es 0, no 20", () => {
    // Un 1 sobre 5 es la PEOR calificación posible. Presentarlo como «20 de 100»
    // diría que algo se está haciendo bien.
    assert.equal(climateIndex([{ average: 1, count: 5 }]), 0);
    assert.equal(climateIndex([{ average: 5, count: 5 }]), 100);
    assert.equal(climateIndex([{ average: 3, count: 5 }]), 50);
    assert.equal(climateIndex([{ average: 4, count: 5 }]), 75);
  });

  await t.test("pondera por respuestas, no por pregunta", () => {
    // La primera la contestaron 4 y la segunda 1: la primera debe pesar más.
    const index = climateIndex([{ average: 5, count: 4 }, { average: 1, count: 1 }]);
    // (5*4 + 1*1) / 5 = 4.2 → ((4.2-1)/4)*100 = 80
    assert.equal(index, 80);
  });

  await t.test("ignora preguntas sin respuestas", () => {
    assert.equal(climateIndex([{ average: 4, count: 3 }, { average: null, count: 0 }]), 75);
  });

  await t.test("sin ninguna respuesta es null, no cero", () => {
    // Un 0 diria «clima pesimo»; lo que pasa es que nadie contesto.
    assert.equal(climateIndex([]), null);
    assert.equal(climateIndex([{ average: null, count: 0 }]), null);
  });
});

test("semáforo", async (t) => {
  await t.test("desde 4 es bueno", () => {
    assert.equal(ratingLevel(4), "bueno");
    assert.equal(ratingLevel(4.6), "bueno");
  });

  await t.test("el punto medio (3) YA es atención, no «regular»", () => {
    // En clima laboral la gente marca el centro cuando no quiere decir que esta
    // mal. Tratar el 3 como aceptable esconde justo lo que hay que mirar.
    assert.equal(ratingLevel(3), "atencion");
    assert.equal(ratingLevel(3.9), "atencion");
  });

  await t.test("por debajo de 3 es crítico", () => {
    assert.equal(ratingLevel(2.9), "critico");
    assert.equal(ratingLevel(1), "critico");
  });

  await t.test("sin dato se distingue de mal dato", () => {
    assert.equal(ratingLevel(null), "sin-dato");
  });

  await t.test("el semáforo del índice usa los mismos cortes", () => {
    assert.equal(indexLevel(75), "bueno");   // equivale a 4.0
    assert.equal(indexLevel(50), "atencion"); // equivale a 3.0
    assert.equal(indexLevel(49), "critico");
    assert.equal(indexLevel(null), "sin-dato");
  });
});

test("dispersión: el promedio engaña con equipos chicos", async (t) => {
  await t.test("todos de acuerdo dispersa cero", () => {
    // Cinco personas pusieron 3.
    assert.equal(spread([0, 0, 5, 0, 0]), 0);
    assert.equal(isSplit([0, 0, 5, 0, 0]), false);
  });

  await t.test("un equipo partido se detecta aunque el promedio parezca normal", () => {
    // Dos pusieron 5 y tres pusieron 1: promedio 2.6, pero no representa a nadie.
    const distribution = [3, 0, 0, 0, 2];
    assert.ok((spread(distribution) ?? 0) >= 1.2);
    assert.equal(isSplit(distribution), true, "hay que avisar de esto, no solo dar la media");
  });

  await t.test("sin respuestas no hay dispersión", () => {
    assert.equal(spread([0, 0, 0, 0, 0]), null);
    assert.equal(isSplit([0, 0, 0, 0, 0]), false);
  });
});

test("por dónde empezar", async (t) => {
  const preguntas = [
    { id: "a", average: 4.5, count: 4 },
    { id: "b", average: 2.1, count: 4 },
    { id: "c", average: 3.2, count: 4 },
    { id: "d", average: null, count: 0 }
  ];

  await t.test("devuelve las peores, de peor a mejor", () => {
    assert.deepEqual(worstQuestions(preguntas, 2).map((q) => q.id), ["b", "c"]);
  });

  await t.test("no cuela las que nadie contestó", () => {
    assert.ok(!worstQuestions(preguntas, 4).some((q) => q.id === "d"));
  });
});

test("tasa de respuesta", async (t) => {
  await t.test("redondea a entero", () => {
    assert.equal(responseRate(3, 4), 75);
    assert.equal(responseRate(5, 5), 100);
  });

  await t.test("sin destinatarios no hay tasa: no se divide entre cero", () => {
    assert.equal(responseRate(0, 0), null);
  });
});

test("audiencia", async (t) => {
  await t.test("las dos opciones tienen nombre para la interfaz", () => {
    assert.equal(AUDIENCE_LABEL.ALL, "Todo el equipo");
    assert.equal(AUDIENCE_LABEL.ADVISORS, "Solo asesores");
  });
});
