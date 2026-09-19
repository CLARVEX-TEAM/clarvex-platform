import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as colaOffline from "../lib/cola-offline";
import type { OperacionGuardada } from "../lib/cola-almacen";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Una corrección de asistencia no se puede firmar al capturarla.** La firma
 * lleva un reto del servidor, de un solo uso y con ventana de dos minutos:
 * guardada sin señal, llegaría vencida y el servidor la rechazaría. Hay que
 * pedir reto y firmar EN EL MOMENTO DEL ENVÍO.
 *
 * Eso no relaja la protección --el aparato prueba posesión cuando de verdad
 * manda, que es lo que la ventana cubre-- pero sí crea dos formas de fallar que
 * no dan error:
 *
 *  - que la operación firmada salga como un formulario, y el servidor la
 *    rechace sin que nadie entienda por qué;
 *  - que una captura guardada con el formato ANTERIOR deje de entenderse al
 *    publicar esta versión. Eso pierde en silencio lo que la tienda ya había
 *    capturado, que es justo lo que la cola existe para evitar.
 *
 * Se ejecuta `lib/cola-envio` REAL en una VM, con el almacén y el puente nativo
 * simulados. `lib/cola-offline` se le pasa de verdad: es puro.
 */

class SinRedFalsa extends Error {
  constructor() { super("sin red"); this.name = "SinRed"; }
}

function escenario(opciones: { firmaFalla?: "sin-red" | "sin-plugin" } = {}) {
  const firmadas: Array<{ ruta: string; init: RequestInit }> = [];
  const planas: Array<{ ruta: string; init: RequestInit }> = [];

  const deps: Record<string, unknown> = {
    "@/lib/cola-offline": colaOffline,
    "@/lib/cola-almacen": {
      hayAlmacen: () => true,
      leerTodo: async () => [],
      guardar: async () => true,
      borrar: async () => undefined
    },
    "@/lib/native-device-client": {
      SinRed: SinRedFalsa,
      nativeDeviceFetch: async (ruta: string, init: RequestInit) => {
        if (opciones.firmaFalla === "sin-red") throw new SinRedFalsa();
        if (opciones.firmaFalla === "sin-plugin") throw new Error("Esta función requiere la APK registrada.");
        firmadas.push({ ruta, init });
        return new Response(JSON.stringify({ ok: true, id: "corr-1" }), { status: 201 });
      }
    }
  };

  const exports: Record<string, unknown> = {};
  const source = readFileSync("lib/cola-envio.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  const fetchFalso = async (ruta: string, init: RequestInit) => {
    planas.push({ ruta, init });
    return new Response("{}", { status: 200 });
  };

  vm.runInNewContext(code, {
    exports,
    require: (id: string) => { assert.ok(id in deps, `dependencia no simulada: ${id}`); return deps[id]; },
    fetch: fetchFalso, Response, Request, FormData, File, Blob, Headers,
    // ⚠️ `Error` va compartido: sin él, un `instanceof Error` dentro de la VM
    // no reconoce lo que lanza el simulador, que vive en el realm de fuera.
    Error,
    crypto, window: undefined, console: { warn() {}, error() {} }
  });

  return {
    intentar: (exports as { intentar: (op: OperacionGuardada) => Promise<{ status: number | null; codigo: string | null; local?: string }> }).intentar,
    firmadas,
    planas
  };
}

const CLAVE = "018f3a2b-7c4d-7e8f-9012-3456789abcde";

const correccion: OperacionGuardada = {
  id: CLAVE,
  creada: 1,
  ruta: "/api/app/native/attendance-corrections",
  etiqueta: "Corrección del 2026-09-18",
  intentos: 0,
  ultimoError: null,
  estado: "pendiente",
  campos: [],
  nombreArchivo: null,
  json: JSON.stringify({ date: "2026-09-18", requestedStatus: "ON_TIME", reason: "checador caído" }),
  firmado: true
};

test("⚠️ la operacion firmada se manda FIRMANDO, no como formulario", async () => {
  const caso = escenario();
  const salida = await caso.intentar(correccion);

  assert.equal(salida.status, 201);
  assert.equal(caso.planas.length, 0, "no pasa por el `fetch` plano");
  assert.equal(caso.firmadas.length, 1, "pasa por el fetch firmado, que pide reto y firma AHORA");

  const [enviada] = caso.firmadas;
  assert.equal(enviada?.ruta, "/api/app/native/attendance-corrections");
  assert.equal(enviada?.init.body, correccion.json, "con el cuerpo exacto que se capturó");

  const cabeceras = enviada?.init.headers as Record<string, string>;
  assert.equal(cabeceras["Content-Type"], "application/json");
  assert.equal(cabeceras["Idempotency-Key"], CLAVE, "y con la clave, para que el reintento no duplique");
});

test("⚠️ una captura guardada con el formato ANTERIOR sigue saliendo", async () => {
  /*
   * Al publicar esta versión puede haber operaciones ya en el teléfono de la
   * tienda, guardadas sin `json` ni `firmado`. Si dejaran de entenderse, se
   * perderían en silencio.
   */
  const vieja = {
    id: CLAVE,
    creada: 1,
    ruta: "/api/checklist",
    etiqueta: "Foto de Abrir caja",
    intentos: 0,
    ultimoError: null,
    estado: "pendiente",
    campos: [["itemKey", "abrir-caja"], ["image", new Blob(["x"], { type: "image/jpeg" })]],
    nombreArchivo: "evidencia.jpg"
  } as unknown as OperacionGuardada;

  const caso = escenario();
  const salida = await caso.intentar(vieja);

  assert.equal(salida.status, 200);
  assert.equal(caso.firmadas.length, 0, "no se intenta firmar lo que no lo pedía");
  assert.equal(caso.planas.length, 1);
  assert.ok(caso.planas[0]?.init.body instanceof FormData, "sigue siendo un formulario");
});

test("sin red la firmada se reintenta, no se pierde", async () => {
  const caso = escenario({ firmaFalla: "sin-red" });
  // Campo a campo y no `deepEqual`: el objeto nace dentro de la VM y su
  // prototipo no es el de este realm.
  const salida = await caso.intentar(correccion);
  assert.equal(salida.status, null, "sin respuesta: se reintenta");
  assert.equal(salida.codigo, null);
  assert.equal(salida.local, undefined, "y NO se marca como fallo local");
});

test("⚠️ un fallo LOCAL se da por perdido en vez de atascar la cola", async () => {
  /*
   * La APK sin el plugin de identidad no se arregla esperando. Reintentarlo
   * dejaría la cola parada delante de todo lo demás --es FIFO-- y con ella las
   * capturas que sí podrían llegar.
   */
  const caso = escenario({ firmaFalla: "sin-plugin" });
  const salida = await caso.intentar(correccion);
  assert.equal(salida.status, null);
  assert.match(salida.local ?? "", /APK/);
});
