import assert from "node:assert/strict";
import test from "node:test";
import { intentar } from "../lib/cola-envio";
import type { OperacionGuardada } from "../lib/cola-almacen";

/*
 * Por qué existen estas pruebas.
 *
 * Las DECISIONES de la cola viven en `lib/cola-offline` y ya están cubiertas.
 * Aquí se prueba la única parte que toca la red, que es donde puede romperse sin
 * dar error:
 *
 *  - si se pierde la cabecera `Idempotency-Key`, el reintento DUPLICA la
 *    escritura --y un duplicado de inventario no se nota hasta el conteo físico;
 *  - si se pierde la foto al rehacer el formulario, la evidencia llega vacía y
 *    el servidor la da por buena;
 *  - si el `codigo` del 409 no se lee del cuerpo, los dos conflictos opuestos
 *    del candado de idempotencia se vuelven indistinguibles.
 *
 * `FormData` y `Blob` existen en Node 22, así que se ejecuta el código real con
 * `fetch` suplantado en vez de comprobar el archivo por fuera.
 */

const CLAVE = "018f3a2b-7c4d-7e8f-9012-3456789abcde";

function operacion(campos: Array<[string, string | Blob]>): OperacionGuardada {
  return {
    id: CLAVE,
    creada: 1,
    ruta: "/api/checklist",
    etiqueta: "Foto de Abrir caja",
    intentos: 0,
    ultimoError: null,
    estado: "pendiente",
    campos,
    nombreArchivo: "evidencia.jpg"
  };
}

/** Deja `fetch` suplantado y devuelve lo que recibió. */
function espiar(responder: () => Response | Promise<Response> | never) {
  const visto: { url?: string; init?: RequestInit } = {};
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    visto.url = url;
    visto.init = init;
    return responder();
  }) as typeof fetch;
  return { visto, restaurar: () => { globalThis.fetch = original; } };
}

test("⚠️ la clave de idempotencia VIAJA en la cabecera", async () => {
  // Sin ella el reintento deja de ser un reintento y se vuelve una escritura
  // nueva: el duplicado que la tabla `IdempotentWrite` existe para impedir.
  const { visto, restaurar } = espiar(() => new Response("{}", { status: 200 }));
  try {
    await intentar(operacion([["itemKey", "abrir-caja"]]));
  } finally {
    restaurar();
  }
  const cabeceras = visto.init?.headers as Record<string, string>;
  assert.equal(cabeceras["Idempotency-Key"], CLAVE);
  assert.equal(visto.init?.method, "POST");
  assert.equal(visto.url, "/api/checklist");
});

test("⚠️ la FOTO se rehace con su nombre, no se queda por el camino", async () => {
  const foto = new Blob(["bytes de la foto"], { type: "image/jpeg" });
  const { visto, restaurar } = espiar(() => new Response("{}", { status: 200 }));
  try {
    await intentar(operacion([
      ["itemKey", "abrir-caja"],
      ["date", "2026-09-18"],
      ["image", foto]
    ]));
  } finally {
    restaurar();
  }

  const form = visto.init?.body as FormData;
  assert.ok(form instanceof FormData, "el cuerpo es un formulario, no JSON");
  assert.equal(form.get("itemKey"), "abrir-caja");
  assert.equal(form.get("date"), "2026-09-18", "el día de la captura sigue dentro");

  const adjunta = form.get("image");
  assert.ok(adjunta instanceof File, "la foto llega como archivo");
  assert.equal(adjunta.name, "evidencia.jpg");
  assert.equal(adjunta.size, foto.size, "y con sus bytes, no vacía");
});

test("⚠️ el codigo del 409 se lee del CUERPO", async () => {
  /*
   * Los dos 409 del candado significan lo contrario. Distinguirlos por el texto
   * del error ataría la cola a una frase que alguien reescribirá.
   */
  for (const codigo of ["en-curso", "clave-repetida"]) {
    const { restaurar } = espiar(() => new Response(
      JSON.stringify({ error: "da igual lo que diga", codigo }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    ));
    try {
      assert.deepEqual(await intentar(operacion([["itemKey", "x"]])), { status: 409, codigo });
    } finally {
      restaurar();
    }
  }
});

test("una respuesta sin JSON no rompe nada: el status ya decide", async () => {
  const { restaurar } = espiar(() => new Response("<html>502</html>", { status: 502 }));
  try {
    assert.deepEqual(await intentar(operacion([["itemKey", "x"]])), { status: 502, codigo: null });
  } finally {
    restaurar();
  }
});

test("⚠️ si la peticion no llega a salir, se devuelve null y NO se lanza", async () => {
  /*
   * Es el caso normal en la tienda, no un error. Que `intentar` lanzara aquí
   * tumbaría el vaciado entero y con él las operaciones que vienen detrás.
   */
  const { restaurar } = espiar(() => { throw new TypeError("Failed to fetch"); });
  try {
    assert.deepEqual(await intentar(operacion([["itemKey", "x"]])), { status: null, codigo: null });
  } finally {
    restaurar();
  }
});

