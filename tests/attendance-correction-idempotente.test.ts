import assert from "node:assert/strict";
import test from "node:test";
import crypto, { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";

/*
 * Por qué existen estas pruebas.
 *
 * Una corrección de asistencia se puede capturar sin señal, así que la cola la
 * va a reintentar. Sin guarda de idempotencia pasan dos cosas, y ninguna da
 * error:
 *
 * ⚠️ **La persona recibe lo contrario de lo que ocurrió.** Si el primer intento
 * SÍ llegó pero su respuesta se perdió, el reintento choca con «ya tienes una
 * corrección en revisión para ese día» --un 409-- y la cola se lo cuenta como
 * «no se pudo guardar. Vuelve a hacerla». Se guardó.
 *
 * ⚠️ **Y la evidencia se duplica en R2.** Su nombre lleva `Date.now()` y un
 * UUID, así que cada intento deja un objeto más, pagado y sin dueño.
 *
 * Esto toca nómina --una corrección mueve el banco de minutos-- así que se
 * ejecuta el handler REAL con sus fronteras simuladas. Sin Prisma, sin `.env`,
 * sin R2.
 */

/** Guarda de idempotencia fiel y en memoria, para no importar Prisma. */
function guardaEnMemoria() {
  const vistas = new Map<string, { bodyHash: string; status: number; body: unknown }>();
  return async (
    contexto: { clave: string | null; storeId: string; cuerpo: unknown },
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

function escenario() {
  const subidas: string[] = [];
  const correcciones: Array<{ date: Date }> = [];
  let avisosAGerencia = 0;
  const conIdempotencia = guardaEnMemoria();


  const deps: Record<string, unknown> = {
    "node:crypto": { ...crypto, default: crypto, randomUUID: () => "uuid-fijo", createHash },
    zod: { z },
    "next/server": {
      NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) }
    },
    "@/lib/attendance": { classifyArrival: () => "ON_TIME" },
    "@/lib/audit": { recordAudit: async () => undefined },
    "@/lib/api": {
      requireSession: async () => ({ storeId: "tienda-1", userId: "user-1", name: "Itzel", role: "ASESOR" }),
      isApiError: () => false,
      denyDemo: () => null,
      enforceUploadRateLimit: async () => null,
      parseJson: async (request: Request) => ({ data: await request.json() })
    },
    "@/lib/dashboard-kpi": { dashboardDateKey: () => "2026-09-18" },
    "@/lib/evidence": { validateEvidenceImage: () => ({ valid: true, extension: "jpg" }) },
    "@/lib/hours-balance": { dayBalanceMinutes: () => 0 },
    "@/lib/idempotencia-db": {
      conIdempotencia,
      claveDeLaPeticion: (request: Request) => request.headers.get("Idempotency-Key")?.trim() || null
    },
    "@/lib/native-device-auth": {
      requireNativeDevice: async () => ({ installationId: "inst-1" }),
      isNativeDeviceError: () => false
    },
    "@/lib/notifications": { createNotifications: async () => { avisosAGerencia += 1; } },
    "@/lib/prisma": {
      prisma: {
        attendanceCorrectionRequest: {
          // Nadie tiene una pendiente todavía: la guarda es lo único que frena
          // el reintento, que es justo lo que se está probando.
          findFirst: async () => null,
          create: async ({ data }: { data: { date: Date } }) => {
            correcciones.push({ date: data.date });
            return { id: `corr-${correcciones.length}` };
          }
        },
        user: { findMany: async () => [{ id: "gerente-1" }] }
      }
    },
    "@/lib/push": { dispatchPushToUsers: async () => undefined },
    "@/lib/r2": {
      uploadToR2: async (key: string) => { subidas.push(key); return `r2://${key}`; },
      deleteFromR2: async () => undefined
    },
    "@/lib/r2-keys": { storeKey: (_s: string, _c: string, name: string) => name }
  };

  const exports: Record<string, unknown> = {};
  const source = readFileSync("app/api/app/native/attendance-corrections/route.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => { assert.ok(id in deps, `dependencia no simulada: ${id}`); return deps[id]; },
    Request, Response, URL, Date, Boolean, Error, Number, Buffer, Uint8Array, JSON,
    console: { warn() {}, error() {} }
  });

  const POST = (exports as { POST: (r: Request) => Promise<{ status: number; body: unknown }> }).POST;

  return {
    async enviar(clave: string | null) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (clave) headers["Idempotency-Key"] = clave;
      return POST(new Request("http://localhost/api/app/native/attendance-corrections", {
        method: "POST",
        headers,
        body: JSON.stringify({
          date: "2026-09-18",
          requestedStatus: "ON_TIME",
          requestedArrivedAt: "10:30",
          requestedLeftAt: null,
          reason: "El checador no marcó mi entrada.",
          evidence: { data: Buffer.from("foto").toString("base64"), mimeType: "image/jpeg", name: "e.jpg" }
        })
      }));
    },
    estado: () => ({ subidas: subidas.length, correcciones: correcciones.length, avisosAGerencia })
  };
}

const CLAVE = "018f3a2b-7c4d-7e8f-9012-3456789abcde";

test("⚠️ el reintento devuelve el MISMO 201, no un «no se pudo guardar»", async () => {
  const caso = escenario();

  const primera = await caso.enviar(CLAVE);
  assert.equal(primera.status, 201);
  assert.deepEqual(caso.estado(), { subidas: 1, correcciones: 1, avisosAGerencia: 1 });

  // La cola reintenta porque la primera respuesta no llegó al teléfono.
  const segunda = await caso.enviar(CLAVE);
  assert.equal(segunda.status, 201, "⚠️ NO un 409: se guardó, y eso es lo que hay que decirle a la persona");
  assert.deepEqual(segunda.body, primera.body);

  assert.deepEqual(
    caso.estado(),
    { subidas: 1, correcciones: 1, avisosAGerencia: 1 },
    "ni evidencia duplicada en R2, ni doble solicitud, ni doble aviso a gerencia"
  );
});

test("sin clave se comporta como siempre", async () => {
  // La guarda se AÑADE a quien la pide; no se le impone a lo que ya funciona.
  const caso = escenario();
  await caso.enviar(null);
  await caso.enviar(null);
  assert.deepEqual(caso.estado(), { subidas: 2, correcciones: 2, avisosAGerencia: 2 });
});

test("dos correcciones distintas siguen siendo dos", async () => {
  const caso = escenario();
  await caso.enviar(`${CLAVE}-a`);
  await caso.enviar(`${CLAVE}-b`);
  assert.equal(caso.estado().correcciones, 2);
});
