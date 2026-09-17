import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("kiosko: fotos y escaneo solicitan captura compatible con Capacitor", () => {
  const source = readFileSync("app/checklist/page.tsx", "utf8");
  const inputs = [...source.matchAll(/<input\b[^>]+>/g)].map(([tag]) => tag);
  const cameras = inputs.filter(tag => tag.includes('capture="environment"'));
  assert.ok(cameras.length >= 2);
  for (const camera of cameras) assert.match(camera, /accept="image\/\*"/);
  const galleries = inputs.filter(tag => tag.includes("ref={galleryRef}"));
  assert.ok(galleries.length >= 1);
  for (const gallery of galleries) assert.doesNotMatch(gallery, /capture=/);
  assert.match(source, /scannerDocumentosNativo/);
  assert.match(source, /data-native-checklist/);
});

test("APK: las notificaciones solo navegan a rutas internas", async () => {
  const { rutaInternaDeNotificacion } = await import("../lib/puente-nativo");
  const origin = "https://team.clarvex.tech";
  assert.equal(rutaInternaDeNotificacion("/checklist?seccion=CIERRE#pendiente", origin), "/checklist?seccion=CIERRE#pendiente");
  assert.equal(rutaInternaDeNotificacion("//malicioso.example/robar", origin), null);
  assert.equal(rutaInternaDeNotificacion("https://malicioso.example/robar", origin), null);
  assert.equal(rutaInternaDeNotificacion("javascript:alert(1)", origin), null);
  assert.equal(rutaInternaDeNotificacion(42, origin), null);
});

test("kiosko: puede consultar actualizaciones, pero no otras APIs ni métodos", async () => {
  const exports: Record<string, unknown> = {};
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { next: () => ({ status: 200 }), json: (_body: unknown, init: { status: number }) => init } },
    "@/lib/access-control": { canManageDataSources: () => false },
    "@/lib/session-token": { SESSION_COOKIE: "test", bearerToken: () => null, verifySessionToken: async (token: string) => token === "kiosk" ? { checklistOnly: true } : null }
  };
  const code = ts.transpileModule(readFileSync("middleware.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, { exports, process: { env: {} }, require: (id: string) => {
    assert.ok(id in deps, `Dependencia inesperada: ${id}`); return deps[id];
  } });
  const run = exports.middleware as (req: unknown) => Promise<{ status: number }>;
  for (const [path, method, token, expected] of [
    ["/api/app/version", "GET", "kiosk", 200],
    ["/api/app/version", "POST", "kiosk", 403],
    ["/api/app/version/extra", "GET", "kiosk", 403],
    ["/api/app-data", "GET", "kiosk", 403],
    ["/api/app/version", "GET", "", 401],
    ["/api/checklist", "GET", "kiosk", 200]
  ] as const) {
    const res = await run({ nextUrl: { pathname: path }, method,
      cookies: { get: () => token ? { value: token } : undefined }, headers: new Headers() });
    assert.equal(res.status, expected, `${method} ${path} (${token || "anónimo"})`);
  }
});
