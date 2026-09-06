import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Ejecuta el handler real; solo sustituye sus fronteras Prisma/Slack.
// Ningún import de Prisma ni lectura de .env ocurre en estas pruebas.
function escenario(fallo: "ninguno" | "antes" | "commit" | "carrera" | "lectura") {
  let persisted = false;
  let slackCalls = 0;
  let active = false;
  const auditLog = { findFirst: async () => {
    if (fallo === "lectura") throw new Error("Lectura indisponible");
    return persisted ? { id: "test-ack", createdAt: new Date() } : null;
  } };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: {} },
    "@/lib/prisma": { prisma: { auditLog, $transaction: async (callback: (tx: unknown) => Promise<boolean>) => {
      if (fallo === "antes" || fallo === "lectura") throw new Error("Base indisponible");
      if (active) throw new Error("Conflicto serializable");
      active = true;
      try {
        const result = await callback({ auditLog: {
          findFirst: auditLog.findFirst,
          create: async () => ({ id: "test-ack" })
        } });
        if (fallo === "commit") throw new Error("COMMIT rechazado");
        if (fallo === "carrera") { persisted = true; throw new Error("Otra petición confirmó"); }
        persisted = true;
        return result;
      } finally { active = false; }
    } } },
    "@/lib/slack-ops": {
      verifySlackOpsAckToken: (token: string) => token === "valido"
        ? { entity: "test", entityId: "test-1", title: "Prueba" } : null,
      updateSlackOpsMessageReviewed: async () => { slackCalls++; return { ok: true }; }
    }
  };
  const exports: Record<string, unknown> = {};
  const source = readFileSync("app/api/webhooks/slack/ack/route.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, require: (id: string) => { assert.ok(id in deps); return deps[id]; },
    Request, Response, URL, console: { warn() {}, error() {} }
  });
  return { route: exports as typeof import("../app/api/webhooks/slack/ack/route"),
    estado: () => ({ persisted, slackCalls }) };
}
const peticion = (token = "valido") => new Request("http://localhost/api/webhooks/slack/ack", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token })
});

for (const fallo of ["antes", "commit", "lectura"] as const) {
  test(`Slack: fallo ${fallo} no confirma ni actualiza Slack`, async () => {
    const e = escenario(fallo);
    assert.equal((await e.route.POST(peticion())).status, 503);
    assert.deepEqual(e.estado(), { persisted: false, slackCalls: 0 });
  });
}
test("Slack: GET automático y token inválido no escriben", async () => {
  const e = escenario("ninguno");
  assert.equal((await e.route.GET(new Request("http://localhost/api/webhooks/slack/ack?token=valido"))).status, 200);
  assert.equal((await e.route.POST(peticion("invalido"))).status, 401);
  assert.deepEqual(e.estado(), { persisted: false, slackCalls: 0 });
});
test("Slack: éxito, repetición y carrera requieren registro confirmado", async () => {
  for (const fallo of ["ninguno", "carrera"] as const) {
    const e = escenario(fallo);
    assert.equal((await e.route.POST(peticion())).status, 200);
    assert.equal((await e.route.POST(peticion())).status, 200);
    assert.equal(e.estado().persisted, true);
  }
});
test("Slack: concurrencia simulada no anuncia un COMMIT rechazado", async () => {
  const e = escenario("commit");
  const responses = await Promise.all([e.route.POST(peticion()), e.route.POST(peticion())]);
  assert.deepEqual(responses.map(r => r.status), [503, 503]);
  assert.equal(e.estado().slackCalls, 0);
});
