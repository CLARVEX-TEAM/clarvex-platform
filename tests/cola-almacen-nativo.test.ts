import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import type { OperacionGuardada } from "../lib/cola-almacen";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Un worker de Android no puede leer IndexedDB**, así que dentro de la APK
 * la cola se guarda en archivos nativos. Eso obliga a que las fotos crucen el
 * puente en base64, ida y vuelta, y ahí hay dos formas de romperlo que NO dan
 * error:
 *
 *  - la foto vuelve con otros bytes --o vacía-- y se sube una evidencia
 *    corrupta que el servidor acepta;
 *  - el cuerpo JSON de una operación firmada se pierde por el camino y la
 *    corrección de asistencia llega sin datos.
 *
 * Se ejecuta `lib/cola-almacen` REAL en una VM con el puente simulado, y el
 * almacén nativo se sustituye por un mapa en memoria que se comporta como los
 * archivos de Android.
 */

function escenario() {
  const archivos = new Map<string, Record<string, unknown>>();

  const plugin = {
    guardar: async (op: Record<string, unknown>) => {
      archivos.set(op["id"] as string, op);
      return { guardada: true };
    },
    listar: async () => ({
      operaciones: [...archivos.values()].map((op) => ({
        id: op["id"],
        ruta: op["ruta"],
        creada: op["creada"],
        etiqueta: op["etiqueta"],
        firmado: op["firmado"],
        estado: op["estado"],
        intentos: op["intentos"],
        ultimoError: op["ultimoError"]
      }))
    }),
    leer: async ({ id }: { id: string }) => archivos.get(id) ?? {},
    olvidar: async ({ id }: { id: string }) => { archivos.delete(id); },
    programar: async () => undefined
  };

  const deps: Record<string, unknown> = {
    "@/lib/cola-offline": {},
    "@/lib/puente-nativo": { colaClarvexNativa: () => plugin }
  };

  const exports: Record<string, unknown> = {};
  const source = readFileSync("lib/cola-almacen.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => { assert.ok(id in deps, `dependencia no simulada: ${id}`); return deps[id]; },
    Blob, Uint8Array, String, Error, Boolean, btoa, atob,
    indexedDB: undefined, console: { warn() {}, error() {} }
  });

  return {
    modulo: exports as typeof import("../lib/cola-almacen"),
    archivos
  };
}

const base = {
  id: "018f3a2b-7c4d-7e8f-9012-3456789abcde",
  creada: 1_758_000_000_000,
  ruta: "/api/checklist",
  etiqueta: "Foto de Abrir caja",
  intentos: 0,
  ultimoError: null,
  estado: "pendiente" as const
};

test("⚠️ la FOTO vuelve con los mismos bytes despues de cruzar el puente", async () => {
  const { modulo } = escenario();

  /*
   * Con bytes de verdad, incluidos los que no son texto válido: un `0x00` o un
   * `0xff` mal convertidos darían una imagen corrupta que el servidor guarda
   * igual, y el fallo se vería semanas después al abrir la evidencia.
   */
  const originales = new Uint8Array([0, 1, 127, 128, 200, 255, 65, 10, 13]);
  const foto = new Blob([originales], { type: "image/jpeg" });

  const op: OperacionGuardada = { ...base, campos: [["itemKey", "abrir-caja"], ["image", foto]], nombreArchivo: "evidencia.jpg" };
  assert.equal(await modulo.guardar(op), true);

  const [listada] = await modulo.leerTodo();
  assert.ok(listada);
  // Por longitud y no `deepEqual`: el array nace dentro de la VM y su
  // prototipo no es el de este realm.
  assert.equal(listada.campos.length, 0, "al listar NO vienen los bytes: no caben veinticinco fotos a la vez");

  const entera = await modulo.cuerpoDe(listada);
  assert.ok(entera);
  assert.equal(entera.nombreArchivo, "evidencia.jpg");
  assert.equal(entera.campos[0]?.[1], "abrir-caja");

  const devuelta = entera.campos[1]?.[1];
  assert.ok(devuelta instanceof Blob, "vuelve como archivo");
  assert.equal(devuelta.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await devuelta.arrayBuffer()), originales, "⚠️ byte a byte");
});

test("una foto GRANDE tambien vuelve entera", async () => {
  /*
   * ⚠️ `String.fromCharCode(...array)` con dos megas de golpe se pasa del límite
   * de argumentos y lanza. Pasaría solo con las fotos del escáner, o sea justo
   * en el cierre y nunca en una prueba con datos pequeños.
   */
  const { modulo } = escenario();
  const grandes = new Uint8Array(300_000);
  for (let i = 0; i < grandes.length; i++) grandes[i] = i % 256;

  const op: OperacionGuardada = {
    ...base,
    campos: [["image", new Blob([grandes], { type: "image/jpeg" })]],
    nombreArchivo: "escaneo.jpg"
  };
  assert.equal(await modulo.guardar(op), true);

  const [listada] = await modulo.leerTodo();
  const entera = await modulo.cuerpoDe(listada!);
  const devuelta = entera?.campos[0]?.[1] as Blob;
  assert.equal(devuelta.size, grandes.length);
  assert.deepEqual(new Uint8Array(await devuelta.arrayBuffer()), grandes);
});

test("⚠️ el cuerpo JSON de una operacion firmada sobrevive el viaje", async () => {
  const { modulo } = escenario();
  const json = JSON.stringify({ date: "2026-09-18", reason: "El checador no marcó mi entrada." });
  const op: OperacionGuardada = {
    ...base,
    ruta: "/api/app/native/attendance-corrections",
    campos: [],
    nombreArchivo: null,
    json,
    firmado: true
  };
  assert.equal(await modulo.guardar(op), true);

  const [listada] = await modulo.leerTodo();
  assert.equal(listada?.firmado, true, "sigue marcada como firmada, para que Android la SALTE");

  const entera = await modulo.cuerpoDe(listada!);
  assert.equal(entera?.json, json);
  assert.equal(entera?.campos.length, 0, "el JSON no se cuela como un campo del formulario");
});

test("⚠️ lo que Android ya mando y borro NO se da por perdido", async () => {
  /*
   * El trabajo en segundo plano borra lo que entrega. Si la web tratara esa
   * ausencia como un fallo, diría «no se pudo guardar» sobre algo que sí llegó
   * --al revés de lo que pasó, que es el peor de los dos errores.
   */
  const { modulo, archivos } = escenario();
  const op: OperacionGuardada = { ...base, campos: [["itemKey", "x"]], nombreArchivo: null };
  await modulo.guardar(op);
  archivos.clear();

  assert.equal(await modulo.cuerpoDe(op), null, "null significa «ya no está», no «falló»");
});

test("lo que Android marco como fallida se cuenta como fallida", async () => {
  const { modulo, archivos } = escenario();
  const op: OperacionGuardada = { ...base, campos: [["itemKey", "x"]], nombreArchivo: null };
  await modulo.guardar(op);
  archivos.get(base.id)!["estado"] = "fallida";

  const [listada] = await modulo.leerTodo();
  assert.equal(listada?.estado, "fallida", "y así la franja de arriba puede decirlo");
});
