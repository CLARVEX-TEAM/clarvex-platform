import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import * as ausentes from "../lib/pos-ausentes";
import * as productivity from "../lib/pos-productivity";
import { decodePosDocument } from "../lib/pos-failure-store";
import type { PosFailure } from "../lib/pos-failure-store";
import type { PosVisionTrace } from "../lib/pos-vision-diagnostics";

// Handlers y comprobaciones de autorización reales; solo fronteras de sesión,
// Prisma, proveedor y disco simuladas. Las pruebas del disco usan archivos temporales.
const sourceCache = new Map<string, string>();
function load<T>(file: string, deps: Record<string, unknown>, env: Record<string, string> = {}): T {
  let code = sourceCache.get(file);
  if (!code) {
    code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    sourceCache.set(file, code);
  }
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; },
    process: { env }, Request, Response, URL, Buffer, Uint8Array, console: { warn() {} }
  });
  return exports as T;
}
const next = { NextResponse: Response };
const secret = "solo-ficticio-para-pruebas-de-captura-0000";
const auth = load<typeof import("../lib/admin-capture-auth")>("lib/admin-capture-auth.ts", {
  "node:crypto": { timingSafeEqual }, "next/server": next
}, { ADMIN_CAPTURE_SECRET: secret });
const row = { name: "ASESOR SINTETICO", tickets: 2, units: 4, unitsReturned: 1,
  gross: 1000, discount: 100, afterDiscount: 900, returns: 200, net: 700, avgUnits: 1.5, avgAmount: 350 };
/*
 * El pie «Promedio» del reporte, que `posCaptureRows` exige: es lo único que
 * mira el documento entero y caza una fila que el lector no vio.
 *
 * ⚠️ Se calcula a partir de las filas de CADA caso, no una vez para todos. Con
 * el pie del caso normal, el caso «invalid» --que existe para probar el rechazo
 * por CUENTAS de la fila-- fallaría además por el pie, y el archivo dejaría de
 * demostrar cuál de las dos cosas lo detuvo.
 */
const pie = (filas: Array<typeof row>) => {
  const media = (saca: (f: typeof row) => number) => filas.reduce((t, f) => t + saca(f), 0) / filas.length;
  const dos = (n: number) => Math.round(n * 100) / 100;
  return {
    tickets: Math.round(media((f) => f.tickets)), units: Math.round(media((f) => f.units)),
    gross: dos(media((f) => f.gross)), afterDiscount: dos(media((f) => f.afterDiscount)),
    net: dos(media((f) => f.net)), avgUnits: dos(media((f) => f.avgUnits)),
    avgAmount: dos(media((f) => f.avgAmount))
  };
};
const conPie = (filas: Array<typeof row>) => ({
  from: "2026-09-05", to: "2026-09-05", storeNumber: "TEST", rows: filas, promedio: pie(filas)
});
const report = conPie([row]);
const original = Buffer.from("%PDF-original-sintético");
const id = "20000000-0000-4000-8000-000000000001";
const attempt = { provider: "gemini" as const, model: "ficticio", startedAt: "2026-09-06T00:00:00.000Z",
  durationMs: 20, text: '{"lectura":"sintética"}', accepted: false, textTruncated: false, problem: "Cuenta incorrecta" };

/** El horario del día del reporte. Vacío por omisión: sin horario no se avisa. */
type FilaHorario = { userId: string; status: string; user: { name: string } };

function capture(
  mode: "fail" | "ok" | "ambiguous" | "invalid" | "vacio" = "fail",
  storageFails = false,
  storeExists = true,
  horario: FilaHorario[] = []
) {
  const saved: Array<Record<string, unknown>> = [];
  let reads = 0, queries = 0;
  const route = load<typeof import("../app/api/admin/capture/kpis/pos-report/route")>(
    "app/api/admin/capture/kpis/pos-report/route.ts", {
      "next/server": next, zod, "@/lib/admin-capture-auth": auth, "@/lib/pos-productivity": productivity, "@/lib/pos-ausentes": ausentes,
      "@/lib/store-people": { PERSON_WHERE: { active: true } },
      "@/lib/prisma": { prisma: {
        store: { findUnique: async () => { queries++; return storeExists ? { id: "TEST-STORE-A" } : null; } },
        user: { findMany: async (args: { where: { storeId: string } }) => {
          assert.equal(args.where.storeId, "TEST-STORE-A");
          return mode === "ambiguous" ? [
            { id: "a", name: "ASESOR SINTETICO UNO", employeeNumber: "1" },
            { id: "b", name: "ASESOR SINTETICO DOS", employeeNumber: "2" }
          ] : [{ id: "a", name: row.name, employeeNumber: "1" }];
        } },
        // El horario del día del reporte: la segunda opinión que delata una
        // fila que el lector nunca vio. Ver `lib/pos-ausentes`.
        schedule: { findMany: async (args: { where: { date: Date } }) => {
          // ⚠️ Se consulta la fecha DEL REPORTE, no la de hoy. Si esto se
          // rompiera, el aviso no saltaría nunca y parecería que funciona.
          assert.equal(args.where.date.toISOString(), "2026-09-05T00:00:00.000Z");
          return horario;
        } }
      } },
      "@/lib/pos-vision": {
        isVisionConfigured: () => true,
        readPosReport: async (document: string, mime: string, trace: PosVisionTrace) => {
          reads++;
          assert.equal(document, original.toString("base64")); assert.equal(mime, "application/pdf");
          trace.attempts.push(attempt);
          return mode === "fail" ? { ok: false, error: "No cuadra la cuenta" } : {
            ok: true,
            value: mode === "invalid" ? conPie([{ ...row, gross: 1001 }])
              // Una fila ENTERA en ceros: pasa las cuatro cuentas del reporte
              // --0-0=0 dos veces, y con cero tickets las otras dos ni se
              // ejecutan-- y su pie tambien cuadra, porque cero entre uno es
              // cero. Sigue siendo una lectura «valida» que no dice nada: eso
              // es justo lo que el aviso del horario tiene que cazar.
              : mode === "vacio" ? conPie([{ ...row, tickets: 0, units: 0, unitsReturned: 0,
                  gross: 0, discount: 0, afterDiscount: 0, returns: 0, net: 0, avgUnits: 0, avgAmount: 0 }])
              : report
          };
        }
      },
      "@/lib/pos-failure-store": { decodePosDocument, posFailureStore: () => ({
        save: async (data: Record<string, unknown>) => {
          if (storageFails) throw new Error("disco no disponible con datos que no deben salir");
          saved.push(data); return id;
        }
      }) }
    }
  );
  return { route, saved, counts: () => ({ reads, queries }) };
}
function request(token = secret, document = original.toString("base64")) {
  return new Request("http://localhost/api/admin/capture/kpis/pos-report", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ storeId: "TEST-STORE-A", imageBase64: `data:application/pdf;base64,${document}`, mimeType: "application/pdf" })
  });
}

test("captura POS: autorización, tienda y base64 se verifican antes de leer o archivar", async () => {
  const e = capture();
  assert.equal((await e.route.POST(request("incorrecto"))).status, 401);
  assert.deepEqual(e.counts(), { reads: 0, queries: 0 });
  assert.equal((await e.route.POST(request(secret, "%%%"))).status, 400);
  assert.equal(e.counts().reads, 0);
  assert.equal(e.saved.length, 0);
  const absent = capture("fail", false, false);
  assert.equal((await absent.route.POST(request())).status, 404);
  assert.equal(absent.counts().reads, 0);
  assert.equal(absent.saved.length, 0);
});

for (const [mode, stage] of [["fail", "vision"], ["invalid", "validation"], ["ambiguous", "matching"]] as const) {
  test(`captura POS: rechazo ${stage} conserva archivo/intentos y devuelve únicamente el folio`, async () => {
    const e = capture(mode);
    const response = await e.route.POST(request());
    assert.equal(response.status, 422);
    const json = await response.json();
    assert.equal(json.diagnosticId, id);
    assert.equal(json.diagnosticSaved, true);
    assert.equal(e.saved.length, 1);
    assert.equal(e.saved[0].stage, stage);
    assert.equal(e.saved[0].documentBase64, original.toString("base64"));
    // El array viene de otra VM; comparar sus datos, no su prototipo de realm.
    assert.deepEqual(JSON.parse(JSON.stringify(e.saved[0].attempts)), [attempt]);
    assert.ok(!JSON.stringify(json).includes(attempt.text));
    assert.ok(!JSON.stringify(json).includes(original.toString("base64")));
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  });
}

test("captura POS: un disco caído no anuncia un diagnóstico guardado ni sustituye el error de lectura", async () => {
  const e = capture("fail", true);
  const response = await e.route.POST(request());
  assert.equal(response.status, 422);
  const json = await response.json();
  assert.equal(json.diagnosticId, null);
  assert.equal(json.diagnosticSaved, false);
  assert.equal(json.detail[0], "No cuadra la cuenta");
  assert.match(json.detail.at(-1), /Conserva el archivo/);
  assert.ok(!JSON.stringify(json).includes("datos que no deben salir"));
});

test("captura POS: éxito no archiva documentos y conserva el prellenado habitual", async () => {
  const e = capture("ok");
  const response = await e.route.POST(request());
  assert.equal(response.status, 200);
  assert.equal(e.saved.length, 0);
  const json = await response.json();
  assert.equal(json.entries[0].dailySales, 603.45);
  assert.ok(!("attempts" in json));
});

function history(actor: "none" | "manager" | "advisor" | "admin" | "demo", broken = false) {
  let accesses = 0;
  const api = load<typeof import("../lib/api")>("lib/api.ts", {
    "next/server": next, zod,
    "@/lib/session": {
      getServerSession: async () => actor === "none" ? null : {
        platformAdmin: actor === "admin" || actor === "demo", demo: actor === "demo", role: actor === "advisor" ? "ASESOR" : "GERENTE"
      }, clearedSessionCookieHeader: () => "session=; Max-Age=0"
    }, "@/lib/rate-limit": {}
  });
  const record: PosFailure = {
    version: 1, id, storeId: "TEST-STORE-A", createdAt: "2026-09-06T00:00:00.000Z", expiresAt: "2026-09-13T00:00:00.000Z",
    source: "capture-backend", actorVerified: false, stage: "vision", error: "Cuenta incorrecta",
    mimeType: "application/pdf", documentBase64: original.toString("base64"), sha256: "0".repeat(64), attempts: [attempt]
  };
  const route = load<typeof import("../app/api/admin/pos-diagnostics/route")>("app/api/admin/pos-diagnostics/route.ts", {
    "next/server": next, "@/lib/api": api,
    "@/lib/pos-failure-store": { POS_HISTORY_DAYS: 7, decodePosDocument, posFailureStore: () => {
      accesses++;
      if (broken) throw new Error("ruta privada sensible");
      return { read: async (key: string) => key === id ? record : null,
        list: async (store: string) => store === "TEST-STORE-B" ? [] : [{ id, storeId: record.storeId }] };
    } }
  });
  return { route, accesses: () => accesses };
}
const query = (suffix = "") => new Request("http://localhost/api/admin/pos-diagnostics" + suffix, {
  // Incluso con el secreto del backend, los originales requieren sesión de admin.
  headers: { Authorization: `Bearer ${secret}` }
});

for (const actor of ["none", "manager", "advisor", "demo"] as const) {
  test(`historial POS HTTP: ${actor} no lista ni descarga originales o diagnósticos`, async () => {
    const e = history(actor);
    for (const suffix of ["", `?id=${id}`, `?id=${id}&format=original`]) {
      const response = await e.route.GET(query(suffix));
      assert.equal(response.status, actor === "none" ? 401 : 403);
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    }
    assert.equal(e.accesses(), 0);
  });
}

test("historial POS HTTP: admin descarga original exacto como adjunto, nunca contenido ejecutable", async () => {
  const e = history("admin");
  const response = await e.route.GET(query(`?id=${id}&format=original`));
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
  assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Content-Disposition") ?? "", /attachment;.*\.pdf/);
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /sandbox/);
  const diagnostic = await e.route.GET(query(`?id=${id}`));
  const json = await diagnostic.json();
  assert.equal(json.attempts[0].text, attempt.text);
  assert.equal(json.actorVerified, false);
  assert.ok(!("documentBase64" in json));
});

test("historial POS HTTP: filtro de tienda, inexistentes, formatos inválidos y fallo de disco", async () => {
  const e = history("admin");
  assert.deepEqual((await (await e.route.GET(query("?storeId=TEST-STORE-B"))).json()).entries, []);
  assert.equal((await e.route.GET(query(`?id=${id}&storeId=TEST-STORE-B`))).status, 404);
  assert.equal((await e.route.GET(query("?id=inexistente"))).status, 404);
  assert.equal((await e.route.GET(query("?format=original"))).status, 400);
  assert.equal((await e.route.GET(query(`?id=${id}&format=html`))).status, 400);
  const response = await history("admin", true).route.GET(query());
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("ruta privada"));
});

test("⚠️ captura POS: quien trabajó y no viene en el reporte se avisa, sin detener la carga", async () => {
  /*
   * Es la única red contra una fila que el lector NUNCA VIO: las cuatro cuentas
   * del reporte son todas dentro de la fila, así que las que sobreviven cuadran
   * solas, y `unmatched` no la ve porque no hay nombre que reportar.
   *
   * Sin esto, un día con una persona perdida se captura con menos piezas y el
   * kardex resta de menos: el descuadre aparece en el conteo físico, semanas
   * después y sin rastro de qué día fue. Pasó en la ronda de agosto de 2026.
   */
  const e = capture("ok", false, true, [
    { userId: "a", status: "WORKING", user: { name: "ASESOR SINTETICO" } },
    { userId: "b", status: "WORKING", user: { name: "QUIEN FALTA" } },
    { userId: "c", status: "OFF", user: { name: "QUIEN DESCANSA" } }
  ]);
  const response = await e.route.POST(request());

  assert.equal(response.status, 200, "avisar NO puede detener la carga: se puede trabajar y no vender");
  const json = await response.json();
  assert.deepEqual(json.scheduledMissing, ["QUIEN FALTA"]);
  assert.ok(!json.scheduledMissing.includes("QUIEN DESCANSA"), "quien descansa no se echa de menos");
  assert.match(json.scheduledMissingNotice, /QUIEN FALTA/);
  // Y lo que ya funcionaba sigue igual: el prellenado no se toca.
  assert.equal(json.entries.length, 1);
  assert.equal(json.entries[0].pieces, row.units);
});

test("captura POS: sin horario capturado no se inventa un aviso", async () => {
  // «No hay horario» no es «no trabajó nadie». Un aviso que sale siempre deja
  // de leerse, y entonces no sirve el día que señala algo real.
  const json = await (await capture("ok").route.POST(request())).json();
  assert.deepEqual(json.scheduledMissing, []);
  assert.equal(json.scheduledMissingNotice, null);
});

test("⚠️ captura POS: una fila leída ENTERA EN CEROS cuenta como no aparecer", async () => {
  /*
   * Es peor que no leer a esa persona. La fila pasa las cuatro cuentas del
   * reporte --0-0=0 dos veces, y con cero tickets las otras dos ni se
   * ejecutan--, así que llega a la vista previa como una lectura válida y
   * prellena un CERO con toda confianza sobre alguien que pudo haber vendido.
   *
   * Y quien captura lo hace con prisa: si la pantalla no lo señala, se guarda.
   * Los dos casos --ausente y en ceros-- pierden exactamente lo mismo, así que
   * se avisan igual.
   */
  const e = capture("vacio", false, true, [
    { userId: "a", status: "WORKING", user: { name: "ASESOR SINTETICO" } }
  ]);
  const json = await (await e.route.POST(request())).json();

  assert.deepEqual(json.scheduledMissing, ["ASESOR SINTETICO"]);
  assert.match(json.scheduledMissingNotice, /ASESOR SINTETICO/);
  // La fila sigue viajando: se avisa, no se esconde ni se detiene la carga.
  assert.equal(json.entries.length, 1);
  assert.equal(json.entries[0].pieces, 0);
});

test("captura POS: quien SÍ vendió no se señala aunque esté en el horario", async () => {
  // La otra mitad de la regla: el aviso solo sale cuando no hay actividad.
  const json = await (await capture("ok", false, true, [
    { userId: "a", status: "WORKING", user: { name: "ASESOR SINTETICO" } }
  ]).route.POST(request())).json();
  assert.deepEqual(json.scheduledMissing, []);
  assert.equal(json.scheduledMissingNotice, null);
});
