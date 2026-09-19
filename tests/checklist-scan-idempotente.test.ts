import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/*
 * Por qué existen estas pruebas.
 *
 * ⚠️ **Subir la misma página dos veces NO se ve.** Cada POST a esta ruta sube un
 * objeto nuevo a R2 --el nombre lleva `Date.now()`-- y crea otra fila, así que la
 * página aparecería DOS VECES dentro del PDF del cierre. No hay error, no hay
 * log: se descubre abriendo el documento ya entregado a gerencia.
 *
 * Y es exactamente lo que hace la cola sin conexión al reintentar desde la
 * tienda, que es lo que acaba de publicarse.
 *
 * Lo que se fija aquí es ESTRUCTURAL: que la subida y la escritura estén DENTRO
 * de la guarda de idempotencia. La lógica de la guarda ya está cubierta en
 * `tests/idempotencia.test.ts`; aquí se comprueba el cableado, que es lo que
 * alguien puede deshacer sin darse cuenta.
 *
 * Se ejecuta el handler REAL con sus fronteras simuladas. No se importa Prisma,
 * no se lee ningún `.env` y no se toca R2.
 */

/** Una guarda de idempotencia fiel y en memoria, para no importar Prisma. */
function guardaEnMemoria() {
  const vistas = new Map<string, { bodyHash: string; status: number; body: unknown }>();
  return async (
    contexto: { clave: string | null; storeId: string; route: string; cuerpo: unknown },
    escribir: () => Promise<{ status: number; body: unknown }>
  ) => {
    if (!contexto.clave) return { ...(await escribir()), repetida: false };
    const id = `${contexto.storeId}|${contexto.clave}`;
    const bodyHash = createHash("sha256").update(JSON.stringify(contexto.cuerpo)).digest("hex");
    const previa = vistas.get(id);
    if (previa) {
      if (previa.bodyHash !== bodyHash) {
        return { status: 409, body: { error: "otra cosa", codigo: "clave-repetida" }, repetida: false };
      }
      return { status: previa.status, body: previa.body, repetida: true };
    }
    const salida = await escribir();
    vistas.set(id, { bodyHash, ...salida });
    return { ...salida, repetida: false };
  };
}

type Escenario = ReturnType<typeof escenario>;

function escenario(opciones: { vouchers?: boolean } = {}) {
  const subidas: string[] = [];
  const filas: Array<{ itemKey: string; url: string }> = [];
  const conIdempotencia = guardaEnMemoria();

  const deps: Record<string, unknown> = {
    "node:crypto": { createHash },
    "next/server": {
      NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) }
    },
    "@/lib/access-control": { canUseChecklist: () => true },
    "@/lib/api": {
      requireSession: async () => ({ storeId: "tienda-1", userId: "user-1" }),
      isApiError: () => false,
      enforceUploadRateLimit: async () => null
    },
    "@/lib/checklist-store": {
      getStoreChecklistItem: async (_s: string, key: string) => ({
        key,
        kind: "scan",
        label: opciones.vouchers ? "Escanear vouchers de terminal" : "Escanear corte de caja"
      }),
      loadStoreChecklistItems: async () => ([
        { key: "cierre", kind: "scan", label: "Escanear corte de caja" }
      ])
    },
    "@/lib/checklist-scan": { scanRole: (label: string) => label.toLowerCase().includes("voucher") ? "vouchers" : "cierre" },
    "@/lib/cron-time": { resolveMonterreyDate: () => ({ dateKey: "2026-09-19" }) },
    "@/lib/idempotencia-db": {
      conIdempotencia,
      claveDeLaPeticion: (request: Request) => request.headers.get("Idempotency-Key")?.trim() || null
    },
    "@/lib/prisma": {
      prisma: {
        checklistScan: {
          create: async ({ data }: { data: { itemKey: string; url: string } }) => {
            filas.push({ itemKey: data.itemKey, url: data.url });
            return { id: `scan-${filas.length}`, itemKey: data.itemKey, fileName: "p.jpg", createdAt: new Date(0) };
          }
        }
      }
    },
    "@/lib/profile-photo": { validateProfilePhoto: () => ({ valid: true, extension: "jpg" }) },
    "@/lib/r2": {
      uploadToR2: async (key: string) => { subidas.push(key); return `r2://${key}`; },
      deleteFromR2: async () => undefined,
      signR2Url: async (url: string) => url
    },
    "@/lib/r2-keys": { storeKey: (_s: string, _c: string, name: string) => name }
  };

  const exports: Record<string, unknown> = {};
  const source = readFileSync("app/api/checklist/scan/route.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => { assert.ok(id in deps, `dependencia no simulada: ${id}`); return deps[id]; },
    Request, Response, FormData, File, Blob, URL, Date, console: { warn() {}, error() {} }
  });

  const POST = (exports as { POST: (r: Request) => Promise<{ status: number; body: unknown }> }).POST;
  return {
    async subir(clave: string | null, contenido = "pagina uno") {
      const form = new FormData();
      form.append("itemKey", "vouchers");
      form.append("date", "2026-09-18");
      form.append("image", new File([contenido], "p.jpg", { type: "image/jpeg" }));
      const headers: Record<string, string> = {};
      if (clave) headers["Idempotency-Key"] = clave;
      return POST(new Request("http://localhost/api/checklist/scan", { method: "POST", body: form, headers }));
    },
    estado: () => ({ subidas: subidas.length, filas: filas.length })
  };
}

const CLAVE = "018f3a2b-7c4d-7e8f-9012-3456789abcde";

test("⚠️ la MISMA clave no sube la pagina dos veces", async (t) => {
  const caso: Escenario = escenario();

  const primera = await caso.subir(CLAVE);
  assert.equal(primera.status, 201);
  assert.deepEqual(caso.estado(), { subidas: 1, filas: 1 });

  // El reintento de la cola: misma clave, misma foto.
  const segunda = await caso.subir(CLAVE);
  assert.equal(segunda.status, 201, "el cliente recibe el mismo 201 de antes");
  assert.deepEqual(segunda.body, primera.body, "y exactamente la misma respuesta");

  assert.deepEqual(
    caso.estado(),
    { subidas: 1, filas: 1 },
    "⚠️ ni un objeto más en R2 ni una fila más: la página NO se duplica en el PDF"
  );
  t.diagnostic("la subida está dentro de la guarda");
});

test("dos paginas distintas siguen siendo dos paginas", async () => {
  // La guarda no puede convertirse en un candado que se coma escaneos buenos.
  const caso = escenario();
  await caso.subir(`${CLAVE}-a`, "pagina uno");
  await caso.subir(`${CLAVE}-b`, "pagina dos");
  assert.deepEqual(caso.estado(), { subidas: 2, filas: 2 });
});

test("sin clave se comporta como siempre: la guarda se AÑADE, no se impone", async () => {
  const caso = escenario();
  await caso.subir(null);
  await caso.subir(null);
  assert.deepEqual(caso.estado(), { subidas: 2, filas: 2 });
});

test("⚠️ la copia del voucher al cierre TAMPOCO se repite", async () => {
  /*
   * Un voucher se copia además a la tarea de cierre, con su propio objeto y su
   * propia fila. Si esa copia quedara fuera de la guarda, el reintento
   * duplicaría la página en el PDF del cierre --el que se entrega-- y no en el
   * de vouchers, que es donde nadie la buscaría.
   */
  const caso = escenario({ vouchers: true });
  await caso.subir(CLAVE);
  assert.deepEqual(caso.estado(), { subidas: 2, filas: 2 }, "la original y su copia al cierre");

  await caso.subir(CLAVE);
  assert.deepEqual(caso.estado(), { subidas: 2, filas: 2 }, "el reintento no añade nada");
});
