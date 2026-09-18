import assert from "node:assert/strict";
import test from "node:test";
import {
  resumenDeLaCola,
  siguiente,
  tras,
  veredicto,
  type OperacionEnCola
} from "../lib/cola-offline";

/*
 * Por qué existen estas pruebas.
 *
 * La tienda trabaja con señal intermitente y esto decide si una captura acaba
 * llegando o se pierde. Los dos errores posibles son simétricos y los dos ya
 * tienen precedente en este proyecto:
 *
 *  - rendirse ante un corte de red pierde lo que la persona capturó;
 *  - reintentar para siempre atasca la cola detrás de algo que nunca va a
 *    funcionar, y lo de detrás tampoco llega.
 */

const op = (id: string, creada: number, estado: OperacionEnCola["estado"] = "pendiente"): OperacionEnCola => ({
  id,
  creada,
  ruta: "/api/checklist",
  etiqueta: "Foto de Abrir caja",
  intentos: 0,
  ultimoError: null,
  estado
});

test("sin conexion se reintenta: es el caso NORMAL en la tienda", () => {
  assert.deepEqual(veredicto(null), { decision: "reintentar", motivo: "sin conexión" });
});

test("guardado es guardado", () => {
  assert.equal(veredicto(200).decision, "listo");
  assert.equal(veredicto(201).decision, "listo");
});

test("⚠️ los dos 409 significan lo CONTRARIO", () => {
  /*
   * El candado de idempotencia devuelve 409 en dos casos opuestos: «se está
   * guardando, pregunta otra vez» y «esa clave ya se gastó en otra operación».
   * Tratarlos igual pierde una captura o atasca la cola para siempre.
   */
  assert.equal(veredicto(409, "en-curso").decision, "reintentar");
  assert.equal(veredicto(409, "clave-repetida").decision, "rendirse");
});

test("⚠️ el 401 se REINTENTA, y es la excepcion que ya se pago cara", () => {
  /*
   * «401 es todavía no sé, no no hay nada». Al abrir la app el registro del
   * aparato se rechazaba con 401 porque aún no había sesión, y darlo por
   * definitivo perdía el token para siempre.
   */
  assert.equal(veredicto(401).decision, "reintentar");
});

test("el servidor caido o pidiendo espera se reintenta", () => {
  for (const status of [408, 429, 500, 502, 503]) {
    assert.equal(veredicto(status).decision, "reintentar", `${status} es temporal`);
  }
});

test("lo que nunca va a funcionar se da por perdido, no se reintenta eternamente", () => {
  for (const status of [400, 403, 404, 422]) {
    assert.equal(veredicto(status).decision, "rendirse", `${status} no se arregla solo`);
  }
});

test("⚠️ la cola es FIFO y NO se salta la que esta atascada", () => {
  /*
   * Dos operaciones del mismo ítem pueden ser «márcalo» y luego «desmárcalo».
   * Adelantar la segunda deja el checklist al revés de como lo dejó la persona.
   */
  const cola = [op("c", 300), op("a", 100), op("b", 200)];
  assert.equal(siguiente(cola)?.id, "a", "la más vieja primero");

  // Con la primera marcada como fallida, sigue la siguiente EN ORDEN.
  const conFallida = [op("a", 100, "fallida"), op("b", 200), op("c", 300)];
  assert.equal(siguiente(conFallida)?.id, "b");

  assert.equal(siguiente([]), null);
  assert.equal(siguiente([op("a", 100, "fallida")]), null, "solo fallidas: no hay nada que mandar");
});

test("la operacion recuerda sus intentos y por que fallo", () => {
  const despues = tras(op("a", 100), veredicto(null));
  assert.equal(despues?.intentos, 1);
  assert.equal(despues?.estado, "pendiente");
  assert.equal(despues?.ultimoError, "sin conexión");

  // La clave NO cambia al reintentar: es lo que hace que no duplique.
  assert.equal(despues?.id, "a");
});

test("lo guardado sale de la cola", () => {
  assert.equal(tras(op("a", 100), veredicto(200)), null);
});

test("⚠️ una captura que no llego SIEMPRE se dice", () => {
  /*
   * Es el fallo que esta app lleva meses persiguiendo en otras formas: la
   * persona cree que quedó guardada. Las fallidas se nombran aunque ya no quede
   * nada pendiente.
   */
  assert.match(resumenDeLaCola([op("a", 1, "fallida")]).aviso, /no se pudieron guardar/);
  assert.match(resumenDeLaCola([op("a", 1)]).aviso, /esperando conexión/);
  assert.match(resumenDeLaCola([op("a", 1), op("b", 2, "fallida")]).aviso, /1 sin enviar y 1/);

  // Y con la cola limpia no se dice nada: un aviso permanente se deja de leer.
  assert.equal(resumenDeLaCola([]).aviso, "");
});



