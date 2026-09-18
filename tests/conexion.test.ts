import assert from "node:assert/strict";
import test from "node:test";
import { siguienteConexion, type SenalDeConexion } from "../lib/conexion";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ Reportado en tienda el 18 de septiembre de 2026, con la cola ya publicada:
 * «funciona, solo que la franja roja sigue ahí diciendo sin conexión». Las
 * capturas se entregaron solas --prueba de que había red-- y el aviso seguía
 * puesto. En Android el evento `online` del WebView no siempre llega, y la
 * franja dependía solo de él.
 *
 * Un aviso que miente en este sentido es caro: dice «no hay red» a quien sí la
 * tiene, así que la persona deja de capturar creyendo que no va a llegar.
 */

const tras = (sinConexion: boolean, ...senales: SenalDeConexion[]) =>
  senales.reduce(
    (estado, senal) => siguienteConexion(estado.sinConexion, senal),
    { sinConexion, recupero: false }
  );

test("⚠️ una ENTREGA quita el aviso aunque el evento `online` no haya llegado", () => {
  /*
   * Es el fallo reportado. El servidor contestó: hay conexión, y eso es un
   * hecho. `navigator.onLine` es una opinión del sistema.
   */
  const estado = tras(true, { tipo: "entrega" });
  assert.equal(estado.sinConexion, false);
  assert.equal(estado.recupero, true, "y se avisa de que volvió");
});

test("una entrega estando ya en línea no vuelve a anunciar nada", () => {
  // Si no, cada captura que se manda dispararía el aviso verde.
  assert.deepEqual(tras(false, { tipo: "entrega" }), { sinConexion: false, recupero: false });
});

test("el camino normal del navegador se conserva", () => {
  assert.deepEqual(tras(false, { tipo: "evento-offline" }), { sinConexion: true, recupero: false });
  assert.deepEqual(tras(true, { tipo: "evento-online" }), { sinConexion: false, recupero: true });
});

test("⚠️ al volver a la app se MIRA otra vez, no se espera al evento", () => {
  /*
   * `visibilitychange` sí llega siempre en Android, y es exactamente cuando la
   * persona vuelve tras quitar el modo avión. Es la segunda salida del fallo.
   */
  assert.deepEqual(tras(true, { tipo: "mirada", enLinea: true }), { sinConexion: false, recupero: true });
  assert.deepEqual(tras(false, { tipo: "mirada", enLinea: false }), { sinConexion: true, recupero: false });
});

test("mirar y no ver cambio no anuncia una recuperación que no hubo", () => {
  assert.deepEqual(tras(false, { tipo: "mirada", enLinea: true }), { sinConexion: false, recupero: false });
  assert.deepEqual(tras(true, { tipo: "mirada", enLinea: false }), { sinConexion: true, recupero: false });
});

test("una caída posterior vuelve a avisar: el rescate no deja el aviso mudo", () => {
  const estado = tras(true, { tipo: "entrega" }, { tipo: "evento-offline" });
  assert.equal(estado.sinConexion, true);
});

test("⚠️ la secuencia REAL del teléfono termina sin aviso rojo", () => {
  /*
   * Modo avión, se captura, se quita el avión, se vuelve a la app y la cola
   * entrega. Antes de esto el `evento-online` faltaba y la franja se quedaba
   * roja para siempre; ahora la rescatan la mirada y la entrega, por separado.
   */
  const sinEventoOnline = tras(
    false,
    { tipo: "evento-offline" },
    { tipo: "mirada", enLinea: true },
    { tipo: "entrega" }
  );
  assert.equal(sinEventoOnline.sinConexion, false);

  // Y si el sistema ni siquiera actualiza `navigator.onLine`, la entrega basta.
  const soloConLaEntrega = tras(
    false,
    { tipo: "evento-offline" },
    { tipo: "mirada", enLinea: false },
    { tipo: "entrega" }
  );
  assert.equal(soloConLaEntrega.sinConexion, false);
});
