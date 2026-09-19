import assert from "node:assert/strict";
import test from "node:test";
import { camposDeEscaneo, camposDeEvidencia, camposDeTarea } from "../lib/cola-checklist";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ Es el hueco que la idempotencia NO tapa. `/api/checklist` marca el ítem del
 * día que le llegue y, sin fecha, el del SERVIDOR. Una foto capturada el viernes
 * sin señal y entregada el lunes marcaría la tarea del LUNES: una escritura
 * legítima, en el día equivocado, que la clave no puede detener porque nunca
 * hubo una primera.
 *
 * Esta prueba es la que se pone en rojo si alguien quita la fecha del cuerpo.
 */

const tarea = { key: "abrir-caja", label: "Abrir caja", note: null };

function valor(campos: Array<[string, string | Blob]>, nombre: string) {
  return campos.find(([clave]) => clave === nombre)?.[1];
}

test("⚠️ el dia de la captura VIAJA con la operacion", () => {
  const campos = camposDeTarea(tarea, "2026-09-18", true);
  assert.equal(valor(campos, "date"), "2026-09-18");
  assert.equal(valor(campos, "itemKey"), "abrir-caja");
  assert.equal(valor(campos, "completed"), "true");
});

test("desmarcar tambien lleva su dia", () => {
  const campos = camposDeTarea(tarea, "2026-09-18", false);
  assert.equal(valor(campos, "completed"), "false");
  assert.equal(valor(campos, "date"), "2026-09-18");
});

test("la evidencia lleva el dia, la foto y NO cambia el estado de la tarea", () => {
  const foto = new Blob(["x"], { type: "image/jpeg" });
  const campos = camposDeEvidencia(tarea, "2026-09-18", false, foto);
  assert.equal(valor(campos, "date"), "2026-09-18");
  assert.equal(valor(campos, "image"), foto);
  // Adjuntar evidencia no completa la tarea: se manda el estado que ya tenía.
  assert.equal(valor(campos, "completed"), "false");
});

test("sin fecha no se inventa ninguna", () => {
  // El servidor caerá en su propio día, que es lo de siempre. Una fecha
  // inventada sería peor que ninguna.
  const campos = camposDeTarea(tarea, "", true);
  assert.equal(valor(campos, "date"), undefined);
});

test("la nota se conserva; sin nota no se manda vacia", () => {
  const conNota = camposDeTarea({ ...tarea, note: "faltó el cambio" }, "2026-09-18", true);
  assert.equal(valor(conNota, "note"), "faltó el cambio");
  assert.equal(valor(camposDeTarea(tarea, "2026-09-18", true), "note"), undefined);
});

test("⚠️ la pagina escaneada tambien lleva su dia, y NO lleva estado de tarea", () => {
  /*
   * Un escaneo no marca ni desmarca nada: solo agrega una página. Mandar
   * `completed` aquí le cambiaría el estado a la tarea por el camino.
   */
  const pagina = new Blob(["pagina"], { type: "image/jpeg" });
  const campos = camposDeEscaneo(tarea, "2026-09-18", pagina);
  assert.equal(valor(campos, "date"), "2026-09-18");
  assert.equal(valor(campos, "itemKey"), "abrir-caja");
  assert.equal(valor(campos, "image"), pagina);
  assert.equal(valor(campos, "completed"), undefined, "un escaneo no toca el estado de la tarea");
  assert.equal(valor(campos, "note"), undefined);
});
