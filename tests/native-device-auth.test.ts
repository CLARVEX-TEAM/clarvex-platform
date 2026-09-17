import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as cryptoRules from "../lib/native-device-crypto";

function loadGuard(prisma: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync("lib/native-device-auth.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(code, {
    exports,
    require: (id: string) => {
      if (id === "next/server") return { NextResponse: Response };
      if (id === "@/lib/prisma") return { prisma };
      if (id === "@/lib/native-device-crypto") return cryptoRules;
      assert.fail(`Dependencia inesperada: ${id}`);
    },
    Request,
    Response,
    URL,
    Uint8Array,
    Date,
    console
  });
  return exports as typeof import("../lib/native-device-auth");
}

const installationId = "33333333-3333-4333-8333-333333333333";
const challengeId = "challenge-request-1";
const nonce = "nonce-request-1";
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const session = { userId: "user-1", storeId: "store-1" };

function signedRequest(timestamp: string, path = "/api/app/native/device") {
  const payload = cryptoRules.nativeRequestManifest({
    challengeId,
    nonce,
    installationId,
    timestamp,
    method: "GET",
    path,
    bodySha256: cryptoRules.sha256Hex("")
  });
  const signature = sign("sha256", Buffer.from(payload), keys.privateKey).toString("base64");
  return new Request(`https://team.clarvex.tech${path}`, {
    headers: {
      "X-Clarvex-Device-Id": installationId,
      "X-Clarvex-Device-Challenge": challengeId,
      "X-Clarvex-Device-Timestamp": timestamp,
      "X-Clarvex-Device-Signature": signature
    }
  });
}

function fixture(consumed = true) {
  let touched = 0;
  const device = {
    id: "device-1",
    installationId,
    publicKey,
    userId: session.userId,
    storeId: session.storeId,
    profile: "KIOSK",
    appBuild: 7,
    appVersion: "1.6",
    status: "ACTIVE"
  };
  const challenge = {
    id: challengeId,
    installationId,
    userId: session.userId,
    storeId: session.storeId,
    purpose: "REQUEST",
    nonce,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000)
  };
  const tx = {
    nativeDeviceChallenge: { updateMany: async () => ({ count: consumed ? 1 : 0 }) },
    nativeDevice: { update: async () => { touched++; } }
  };
  const prisma = {
    nativeDevice: { findUnique: async () => device },
    nativeDeviceChallenge: { findUnique: async () => challenge },
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx)
  };
  return { guard: loadGuard(prisma), touched: () => touched };
}

test("acepta una firma P-256, consume el nonce y actualiza la última conexión", async () => {
  const { guard, touched } = fixture();
  const result = await guard.requireNativeDevice(signedRequest(String(Date.now())), session as never);
  assert.equal(result instanceof Response, false);
  assert.equal((result as { installationId: string }).installationId, installationId);
  assert.equal(touched(), 1);
});
test("un navegador con sesión pero sin firma recibe 403", async () => {
  const { guard } = fixture();
  const result = await guard.requireNativeDevice(
    new Request("https://team.clarvex.tech/api/app/native/device"),
    session as never
  );
  assert.ok(result instanceof Response);
  assert.equal(result.status, 403);
});

test("un nonce ya consumido no se puede repetir", async () => {
  const { guard, touched } = fixture(false);
  const result = await guard.requireNativeDevice(signedRequest(String(Date.now())), session as never);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 409);
  assert.equal(touched(), 0);
});

test("la firma no sirve para otra ruta", async () => {
  const { guard, touched } = fixture();
  const request = signedRequest(String(Date.now()), "/api/app/native/device?view=one");
  const tampered = new Request("https://team.clarvex.tech/api/app/native/device?view=two", {
    headers: request.headers
  });
  const result = await guard.requireNativeDevice(tampered, session as never);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 403);
  assert.equal(touched(), 0);
});
