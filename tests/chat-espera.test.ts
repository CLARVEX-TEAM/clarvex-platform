import assert from "node:assert/strict";
import test from "node:test";
import { esperaTrasFallo, interpretar } from "../lib/chat-espera";

test("con novedad, refresca y dice hasta donde", () => {
  const s = interpretar({ ok: true, status: 200 }, { hay: true, hasta: "2026-08-31T12:00:00.000Z" });
  assert.equal(s.accion, "refrescar");
  assert.equal(s.accion === "refrescar" && s.hasta, "2026-08-31T12:00:00.000Z");
});

test("sin novedad, vuelve a preguntar", () => {
  // Agotar el plazo es lo NORMAL en un chat tranquilo, no un error.
  assert.equal(interpretar({ ok: true, status: 200 }, { hay: false }).accion, "reintentar");
});

test("un fallo de RED se reintenta", () => {
  /*
   * Perder una peticion por señal intermitente o por volver de segundo plano
   * es lo normal en el telefono de una tienda. Tratarlo como un «no» dejaria
   * el chat mudo hasta que alguien recargue.
   */
  assert.equal(interpretar({ ok: false, status: 502 }, null).accion, "reintentar");
  assert.equal(interpretar({ ok: false, status: 500 }, null).accion, "reintentar");
});

test("un NO del servidor detiene el bucle", () => {
  // Insistir contra un 403 es machacar la base cada pocos ms para siempre.
  for (const status of [401, 403]) {
    const s = interpretar({ ok: false, status }, null);
    assert.equal(s.accion, "parar");
  }
});

test("una peticion mal armada no se reintenta igual de mal", () => {
  assert.equal(interpretar({ ok: false, status: 400 }, null).accion, "parar");
});

test("una respuesta 200 sin cuerpo no rompe", () => {
  // Un proxy puede devolver 200 con el cuerpo vacio; eso es reintentar, no
  // refrescar con `hasta` undefined.
  assert.equal(interpretar({ ok: true, status: 200 }, null).accion, "reintentar");
  assert.equal(interpretar({ ok: true, status: 200 }, { hay: true }).accion, "reintentar");
});

test("la espera tras fallo sube y tiene tope", () => {
  assert.equal(esperaTrasFallo(0), 1000);
  assert.equal(esperaTrasFallo(1), 2000);
  assert.equal(esperaTrasFallo(3), 8000);
  // El tope importa: sin el, veinte telefonos reintentando cada milisegundo
  // rematan un servidor que ya estaba mal.
  assert.equal(esperaTrasFallo(9), 30_000);
  assert.equal(esperaTrasFallo(99), 30_000);
});
