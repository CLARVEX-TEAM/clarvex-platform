import assert from "node:assert/strict";
import test from "node:test";
import { keyboardInsetFrom } from "../lib/keyboard-inset";

test("sin teclado no tapa nada", () => {
  assert.equal(keyboardInsetFrom(844, 844, 0), 0);
});

test("Android: el viewport visual se ENCOGE", () => {
  // Chrome respeta interactive-widget, pero el modal se levanta igual.
  assert.equal(keyboardInsetFrom(844, 500, 0), 344);
});

test("iOS: el viewport visual ademas se DESPLAZA", () => {
  // Aqui esta el fallo que escondia el boton de guardar. Mirando solo la
  // diferencia de alturas darian 244 px y la hoja seguiria parcialmente
  // detras del teclado: hay que descontar tambien el desplazamiento.
  assert.equal(keyboardInsetFrom(844, 600, 100), 144);
});

test("un par de pixeles son redondeo del navegador, no un teclado", () => {
  // Levantar la hoja por 8 px la haria saltar sola al hacer scroll.
  assert.equal(keyboardInsetFrom(844, 836, 0), 0);
  assert.equal(keyboardInsetFrom(844, 820, 0), 0);
});

test("nunca devuelve negativo", () => {
  // Pasa de verdad: al rebotar el scroll, el viewport visual se reporta MAS
  // alto que la ventana. Un inset negativo hundiria la hoja fuera de pantalla.
  assert.equal(keyboardInsetFrom(844, 900, 0), 0);
});

test("un valor no numerico no rompe la hoja", () => {
  assert.equal(keyboardInsetFrom(844, Number.NaN, 0), 0);
});
