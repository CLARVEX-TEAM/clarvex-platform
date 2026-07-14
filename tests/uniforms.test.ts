import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_UNIFORMS, mergeWithDefaults, outfitFor, swatchFor, type UniformDay } from "../lib/uniforms";

const martes = DEFAULT_UNIFORMS[2];

test("el martes ellas van de negro y ellos de blanco", () => {
  // Es EL caso que obliga a tener variante por persona: el mismo día, distinta playera.
  assert.equal(outfitFor(martes, "MUJER").top, "Negra");
  assert.equal(outfitFor(martes, "HOMBRE").top, "Blanca");
  // El pantalón sí coincide.
  assert.equal(outfitFor(martes, "MUJER").bottom, "Mezclilla Clara");
  assert.equal(outfitFor(martes, "HOMBRE").bottom, "Mezclilla Clara");
});

test("sin variante asignada se muestra una referencia, no un hueco", () => {
  // Preferible enseñar algo con un aviso que dejar la pantalla vacía.
  const outfit = outfitFor(martes, null);
  assert.equal(outfit.top, "Negra");
});

test("el sábado lleva su nota de día formal", () => {
  const sabado = DEFAULT_UNIFORMS[6];
  assert.equal(sabado.weekday, 6);
  assert.match(outfitFor(sabado, "HOMBRE").note!, /formal/i);
  assert.equal(outfitFor(sabado, "HOMBRE").bottom, "Café Chino");
});

test("los días que la tienda editó ganan; el resto cae al valor por defecto", () => {
  const guardado: UniformDay[] = [
    { weekday: 1, womanTop: "Guinda", womanBottom: "Negro", manTop: "Guinda", manBottom: "Negro", note: null }
  ];
  const merged = mergeWithDefaults(guardado);

  assert.equal(merged.length, 7); // siempre los 7 días
  assert.equal(merged[1].womanTop, "Guinda");        // el editado
  assert.equal(merged[2].womanTop, "Negra");         // el resto, por defecto
});

test("los colores de los círculos se reconocen", () => {
  assert.equal(swatchFor("Roja"), "#dc2626");
  assert.equal(swatchFor("Azul Marino"), "#1e3a8a");
  assert.equal(swatchFor("Mezclilla Clara"), "#93c5fd");
  assert.equal(swatchFor("Mezclilla Oscura"), "#334155");
});

test("una prenda desconocida no rompe nada: cae a un gris neutro", () => {
  // Gerencia puede escribir lo que quiera al editar. Es cosmético: nunca debe
  // reventar la pantalla por un color que no está en la lista.
  assert.equal(swatchFor("Turquesa fluorescente"), "#94a3b8");
  assert.equal(swatchFor(""), "#94a3b8");
});
