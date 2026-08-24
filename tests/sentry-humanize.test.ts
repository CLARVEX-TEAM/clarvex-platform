import assert from "node:assert/strict";
import test from "node:test";
import { humanizeError } from "../lib/sentry-humanize";

/*
 * La alerta que disparó esto decía `AbortError: signal is aborted without
 * reason`, con la traza minificada. Ilegible para quien la abre en el teléfono
 * a media jornada.
 */

test("traduce el AbortError de nuestros propios timeouts", () => {
  const result = humanizeError("AbortError: signal is aborted without reason");
  assert.equal(result?.title, "Se agotó el tiempo de espera de la red");
  // `warning`, no `error`: es un corte de señal, no un fallo de la app. Lo que
  // quede en rojo tiene que ser lo que de verdad hay que mirar.
  assert.equal(result?.level, "warning");
});

test("reconoce las tres frases con que los navegadores dicen lo mismo", () => {
  // Chrome, Firefox y Safari cada uno por su lado. Sin cubrirlas, la bandeja
  // acaba con el mismo problema partido en tres grupos distintos.
  for (const message of ["TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.", "TypeError: Load failed"]) {
    const result = humanizeError(message);
    assert.equal(result?.level, "warning", message);
    assert.ok(result?.title, message);
  }
});

test("el bundle viejo tras un despliegue SÍ es error, y lo dice", () => {
  const result = humanizeError("ChunkLoadError: Loading chunk 4816 failed.");
  assert.equal(result?.title, "La app quedó con una versión vieja: hace falta recargar");
  // Este no se baja a warning: tiene arreglo (recargar) y conviene verlo.
  assert.equal(result?.level, "error");
});

test("un error de programación se marca como tal", () => {
  const result = humanizeError("TypeError: Cannot read properties of undefined (reading 'id')");
  assert.equal(result?.level, "error");
  assert.equal(result?.title, "Error de programación en la app");
});

test("lo que no se reconoce se deja tal cual", () => {
  // Inventar una traducción genérica sería peor que enseñar el texto original:
  // taparía justo el mensaje que hace falta para entender un caso nuevo.
  assert.equal(humanizeError("Algo rarísimo pasó en el módulo de comisiones"), null);
  assert.equal(humanizeError(""), null);
  assert.equal(humanizeError(undefined), null);
});
