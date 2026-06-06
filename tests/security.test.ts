import assert from "node:assert/strict";
import test from "node:test";
import { canAccessAppData, canModifyPending, hashPin, publicUser, verifyPin } from "../lib/security";
import type { Session } from "../lib/session-token";

const advisorSession: Session = {
  userId: "advisor-1",
  storeId: "store-a",
  role: "ASESOR",
  name: "Asesor",
  employeeNumber: "100"
};

test("login acepta el PIN correcto", async () => {
  const hash = await hashPin("1234");
  assert.equal(await verifyPin("1234", hash), true);
});

test("login rechaza el PIN incorrecto", async () => {
  const hash = await hashPin("1234");
  assert.equal(await verifyPin("9999", hash), false);
});

test("app-data requiere una sesion", () => {
  assert.equal(canAccessAppData(null), false);
  assert.equal(canAccessAppData(advisorSession), true);
});

test("un asesor no puede modificar pendientes de otra tienda", () => {
  assert.equal(canModifyPending(advisorSession, "store-b"), false);
  assert.equal(canModifyPending(advisorSession, "store-a"), false);
});

test("el usuario publico no expone hashes", () => {
  const result = publicUser({ id: "u1", name: "Usuario", employeeNumber: "1", role: "ASESOR" as const, photoUrl: null, biometricEnabled: false, lastLoginAt: null, pinHash: "secret", passwordHash: "secret" });
  assert.equal("pinHash" in result, false);
  assert.equal("passwordHash" in result, false);
});
