import assert from "node:assert/strict";
import test from "node:test";
import { createPowerBiOAuthState, verifyPowerBiOAuthState } from "../lib/integrations/power-bi-oauth-client";
import {
  decryptPowerBiSecret,
  encryptPowerBiSecret
} from "../lib/integrations/power-bi-token-crypto";

const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_ENCRYPTION_KEY = process.env.POWER_BI_TOKEN_ENCRYPTION_KEY;

test.before(() => {
  process.env.AUTH_SECRET = "test-auth-secret-with-32-characters-minimum";
  process.env.POWER_BI_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

test.after(() => {
  process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  process.env.POWER_BI_TOKEN_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
});

test("encryptPowerBiSecret roundtrip", () => {
  const encrypted = encryptPowerBiSecret("refresh-token-demo");
  assert.notEqual(encrypted, "refresh-token-demo");
  assert.equal(decryptPowerBiSecret(encrypted), "refresh-token-demo");
});

test("createPowerBiOAuthState y verifyPowerBiOAuthState", async () => {
  const state = await createPowerBiOAuthState("store-1", "user-1");
  const payload = await verifyPowerBiOAuthState(state);
  assert.equal(payload.storeId, "store-1");
  assert.equal(payload.userId, "user-1");
  assert.ok(payload.nonce.length > 0);
});
