import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  nativeRegistrationManifest,
  nativeRequestManifest,
  nativeRequestPath,
  sha256Hex,
  verifyNativeSignature
} from "../lib/native-device-crypto";

const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicKey = ec.publicKey.export({ format: "der", type: "spki" }).toString("base64");

function signature(payload: string): string {
  return sign("sha256", Buffer.from(payload, "utf8"), ec.privateKey).toString("base64");
}

test("el manifiesto de alta fija usuario, tienda, instalación y nonce", () => {
  const payload = nativeRegistrationManifest({
    challengeId: "challenge-1",
    nonce: "nonce-1",
    installationId: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    storeId: "store-1"
  });
  assert.equal(
    payload,
    "clarvex-native-v1\nREGISTER\nchallenge-1\nnonce-1\n11111111-1111-4111-8111-111111111111\nuser-1\nstore-1"
  );
  assert.equal(verifyNativeSignature(publicKey, payload, signature(payload)), true);
});
test("cambiar cualquier dato firmado invalida la petición", () => {
  const payload = nativeRequestManifest({
    challengeId: "challenge-2",
    nonce: "nonce-2",
    installationId: "22222222-2222-4222-8222-222222222222",
    timestamp: "1789617600000",
    method: "post",
    path: "/api/app/native/device?view=full",
    bodySha256: sha256Hex('{"ok":true}')
  });
  const signed = signature(payload);
  assert.equal(verifyNativeSignature(publicKey, payload, signed), true);
  assert.equal(verifyNativeSignature(publicKey, payload.replace("view=full", "view=other"), signed), false);
  assert.equal(verifyNativeSignature(publicKey, payload.replace("POST", "DELETE"), signed), false);
  assert.equal(verifyNativeSignature(publicKey, `${payload}0`, signed), false);
});

test("solo acepta llaves EC P-256 y base64 canónico", () => {
  const payload = "clarvex-native-v1";
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rsaPublic = rsa.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const rsaSignature = sign("sha256", Buffer.from(payload), rsa.privateKey).toString("base64");
  assert.equal(verifyNativeSignature(rsaPublic, payload, rsaSignature), false);
  assert.equal(verifyNativeSignature(publicKey.replace(/=$/, ""), payload, signature(payload)), false);
  assert.equal(verifyNativeSignature("no-es-base64", payload, signature(payload)), false);
});

test("el path firmado conserva query y nunca incluye origen", () => {
  const request = new Request("https://team.clarvex.tech/api/app/native/device?uno=1&dos=2");
  assert.equal(nativeRequestPath(request), "/api/app/native/device?uno=1&dos=2");
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});
