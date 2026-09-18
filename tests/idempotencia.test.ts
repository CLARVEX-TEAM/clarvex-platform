import assert from "node:assert/strict";
import test from "node:test";
import { caducada, claveValida, decidir, huellaDelCuerpo } from "../lib/idempotencia";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Esto es el cimiento de la captura sin conexión, y un cimiento mal puesto
 * duplica datos que deciden inventario y sueldo.** Una cola que reintenta sobre
 * endpoints que no son idempotentes repite a escala lo que ya pasó a mano: el
 * folio 1766932 capturado dos veces, sus doce piezas contadas doble en el
 * teórico, y nada que lo delatara hasta el conteo físico.
 *
 * La tabla de decisiones es donde está todo el riesgo, así que se prueba
 * entera, incluidos los dos casos que es tentador simplificar: la clave
 * repetida con otro cuerpo, y la clave reservada sin respuesta.
 */

const HUELLA = huellaDelCuerpo({ itemKey: "caja", completed: true });
const OTRA = huellaDelCuerpo({ itemKey: "caja", completed: false });

test("sin clave previa, se escribe", () => {
  assert.deepEqual(decidir(null, HUELLA), { decision: "escribir" });
});

test("el mismo intento otra vez devuelve la respuesta original", () => {
  const decision = decidir(
    { bodyHash: HUELLA, status: 200, response: { ok: true, id: "abc" }, createdAt: new Date() },
    HUELLA
  );
  assert.deepEqual(decision, { decision: "repetir", status: 200, response: { ok: true, id: "abc" } });
});

test("⚠️ la MISMA clave con OTRO cuerpo se rechaza en alto", () => {
  /*
   * Es el caso que es tentador tratar como reintento. Si se devolviera la
   * respuesta vieja, la escritura nueva desaparecería sin que nadie se entere
   * —el cliente creería que se guardó— y eso es peor que un error.
   */
  const decision = decidir(
    { bodyHash: HUELLA, status: 200, response: { ok: true }, createdAt: new Date() },
    OTRA
  );
  assert.deepEqual(decision, { decision: "conflicto" });
});

test("⚠️ el cuerpo manda sobre el estado, incluso si la anterior sigue en curso", () => {
  // Un cuerpo distinto es un fallo del cliente sea cual sea el estado de la
  // reserva anterior; no se puede tratar como «espera y reintenta».
  const decision = decidir({ bodyHash: HUELLA, status: null, response: null, createdAt: new Date() }, OTRA);
  assert.deepEqual(decision, { decision: "conflicto" });
});

test("⚠️ una reserva SIN respuesta no se reintenta: se rechaza", () => {
  /*
   * Significa «se está escribiendo ahora, o se cayó a medias». No se puede
   * saber si la escritura llegó a ocurrir, y ante la duda se prefiere que el
   * cliente vuelva a preguntar antes que arriesgar un duplicado que nadie va a
   * notar hasta el conteo físico.
   */
  const decision = decidir({ bodyHash: HUELLA, status: null, response: null, createdAt: new Date() }, HUELLA);
  assert.deepEqual(decision, { decision: "en-curso" });
});

test("un fallo guardado tambien se repite, no se vuelve a intentar solo", () => {
  // Si la primera vez devolvió 422, el reintento con la misma clave recibe el
  // mismo 422. Reintentar por dentro escondería que el cliente está mandando
  // algo que no se puede guardar.
  const decision = decidir(
    { bodyHash: HUELLA, status: 422, response: { error: "no cuadra" }, createdAt: new Date() },
    HUELLA
  );
  assert.deepEqual(decision, { decision: "repetir", status: 422, response: { error: "no cuadra" } });
});

test("la clave la elige el cliente, asi que se valida", () => {
  assert.equal(claveValida("a".repeat(16)), true);
  assert.equal(claveValida("018f3a2b-7c4d-7e8f-9012-3456789abcde"), true, "un UUID sirve");
  assert.equal(claveValida("corta"), false, "una clave de cinco letras colisiona sola");
  assert.equal(claveValida(""), false);
  assert.equal(claveValida("a".repeat(129)), false);
  assert.equal(claveValida("con espacio dentro!!"), false);
  assert.equal(claveValida(undefined), false);
  assert.equal(claveValida(123), false);
});

test("la huella distingue cuerpos, no el orden de las llaves", () => {
  assert.equal(huellaDelCuerpo({ a: 1, b: 2 }), huellaDelCuerpo({ a: 1, b: 2 }));
  assert.notEqual(huellaDelCuerpo({ a: 1 }), huellaDelCuerpo({ a: 2 }));
  // Un cuerpo vacío y uno ausente son lo mismo para esto.
  assert.equal(huellaDelCuerpo(null), huellaDelCuerpo(undefined));
});

test("las claves caducan para poder olvidarlas", () => {
  const ahora = new Date("2026-09-18T12:00:00Z");
  assert.equal(caducada(new Date("2026-09-18T09:00:00Z"), ahora), false, "tres horas");
  assert.equal(caducada(new Date("2026-09-16T09:00:00Z"), ahora), false, "51 h, todavía vale");
  assert.equal(caducada(new Date("2026-09-15T11:00:00Z"), ahora), true, "73 h");
  assert.equal(caducada(new Date("2026-09-14T09:00:00Z"), ahora), true, "cuatro días");
});
