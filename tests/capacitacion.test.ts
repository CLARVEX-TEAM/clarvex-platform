import assert from "node:assert/strict";
import test from "node:test";
import { calificar, paraResponder, problemasDelCuestionario, type Pregunta } from "../lib/capacitacion";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Si la respuesta correcta llega al teléfono, la constancia no vale nada.**
 * Cualquiera que abra las herramientas del navegador la ve, y entonces
 * «aprobado» deja de significar algo. Es la única regla de este archivo que, si
 * se rompe, no se nota: el examen sigue funcionando igual de bien.
 *
 * ⚠️ Y calificar por POSICIÓN en vez de por id es el otro fallo mudo: reordenar
 * o insertar una pregunta califica mal a todo el mundo, y nadie revisa un examen
 * que ya dio un número.
 */

const preguntas: Pregunta[] = [
  { id: "p1", texto: "¿Cada cuánto se cuenta dama?", opciones: ["Diario", "Semanal", "Nunca"], correcta: 0 },
  { id: "p2", texto: "¿Qué hace un sobrante del CEDIS?", opciones: ["Entra al kardex", "Se aparta y se devuelve"], correcta: 1 },
  { id: "p3", texto: "¿El margen DTO es un techo o una meta?", opciones: ["Meta", "Techo"], correcta: 1 }
];

test("⚠️ la respuesta correcta NO sale del servidor", () => {
  const paraElTelefono = paraResponder(preguntas);
  for (const pregunta of paraElTelefono) {
    assert.equal("correcta" in pregunta, false, `${pregunta.id} no puede llevar la respuesta`);
  }
  // Y el texto completo, por si alguien serializara el objeto entero.
  assert.equal(JSON.stringify(paraElTelefono).includes("correcta"), false);
});

test("⚠️ un campo interno NUEVO tampoco se cuela", () => {
  /*
   * Se construye el objeto campo a campo, no con `...resto` ni `delete`. Así, el
   * día que la pregunta gane una explicación o una pista, no viaja sola.
   */
  const conExtra = [{ ...preguntas[0]!, explicacion: "Porque en agosto faltó producto", pista: "diario" }] as unknown as Pregunta[];
  const salida = paraResponder(conExtra);
  assert.deepEqual(Object.keys(salida[0]!).sort(), ["id", "opciones", "texto"]);
});

test("un examen perfecto aprueba", () => {
  const nota = calificar(preguntas, { p1: 0, p2: 1, p3: 1 });
  assert.deepEqual(nota, { aciertos: 3, total: 3, porcentaje: 100, aprobado: true });
});

test("⚠️ las respuestas van por ID, no por posicion", () => {
  /*
   * Mismo intento, preguntas en otro orden: la nota tiene que ser la misma. Con
   * índices, insertar una pregunta al principio suspendería a todo el mundo sin
   * que nadie lo notara.
   */
  const alReves = [...preguntas].reverse();
  assert.equal(calificar(alReves, { p1: 0, p2: 1, p3: 1 }).porcentaje, 100);
});

test("dejar una en blanco es FALLO, no una averia", () => {
  const nota = calificar(preguntas, { p1: 0, p2: 1 });
  assert.equal(nota.aciertos, 2);
  assert.equal(nota.porcentaje, 67);
  assert.equal(nota.aprobado, false, "67 no llega al 80 por omisión");
});

test("⚠️ lo que manda el cliente no puede romper la calificacion", () => {
  // Esto viene del teléfono: índices fuera de rango, textos, nulos y preguntas
  // que no existen. Nada de eso puede lanzar ni sumar un acierto.
  const nota = calificar(preguntas, {
    p1: 99,
    p2: -1,
    p3: "1" as unknown as number,
    inventada: 0,
    otra: null
  });
  assert.deepEqual(nota, { aciertos: 0, total: 3, porcentaje: 0, aprobado: false });
});

test("un cuestionario SIN preguntas no aprueba a nadie", () => {
  // Aprobar por omisión repartiría constancias por un error de captura.
  assert.deepEqual(calificar([], {}), { aciertos: 0, total: 0, porcentaje: 0, aprobado: false });
});

test("el minimo se puede subir, y manda", () => {
  const dosDeTres = { p1: 0, p2: 1 };
  assert.equal(calificar(preguntas, dosDeTres, 60).aprobado, true);
  assert.equal(calificar(preguntas, dosDeTres, 70).aprobado, false);
});

test("⚠️ un cuestionario mal armado se detecta al GUARDARLO", () => {
  /*
   * Descubrir que la respuesta correcta apunta fuera de la lista mientras
   * alguien hace el examen le hace perder el intento por un error que no es
   * suyo.
   */
  const malo: Pregunta[] = [
    { id: "", texto: "", opciones: ["sola"], correcta: 5 },
    { id: "p1", texto: "Bien", opciones: ["a", ""], correcta: 0 },
    { id: "p1", texto: "Repetida", opciones: ["a", "b"], correcta: 1 }
  ];
  const problemas = problemasDelCuestionario(malo);
  assert.match(problemas.join(" | "), /identificador vacío o repetido/);
  assert.match(problemas.join(" | "), /falta el enunciado/);
  assert.match(problemas.join(" | "), /al menos dos opciones/);
  assert.match(problemas.join(" | "), /no apunta a ninguna opción/);
  assert.match(problemas.join(" | "), /opción vacía/);
});

test("un cuestionario bien armado no da problemas", () => {
  assert.deepEqual(problemasDelCuestionario(preguntas), []);
  assert.match(problemasDelCuestionario([]).join(""), /no tiene preguntas/);
});
