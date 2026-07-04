import assert from "node:assert/strict";
import test from "node:test";
import { canManageDataSources } from "../lib/access-control";
import { canAccessAppData, canModifyPending, hashPin, publicUser, verifyPin } from "../lib/security";
import { encodeSyncLogMessage, serializeDataSource } from "../lib/data-source";
import type { Session } from "../lib/session-token";

const advisorSession: Session = {
  userId: "advisor-1",
  storeId: "store-a",
  role: "ASESOR",
  name: "Asesor",
  employeeNumber: "100",
  platformAdmin: false
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

test("un asesor no puede acceder al Centro de Datos ni ejecutar sync", () => {
  assert.equal(canManageDataSources("ASESOR"), false);
});

test("gerente y subgerente pueden administrar y sincronizar fuentes", () => {
  assert.equal(canManageDataSources("GERENTE"), true);
  assert.equal(canManageDataSources("SUBGERENTE"), true);
});

test("el usuario publico no expone hashes", () => {
  const result = publicUser({ id: "u1", name: "Usuario", employeeNumber: "1", role: "ASESOR" as const, photoUrl: null, biometricEnabled: false, lastLoginAt: null, pinHash: "secret", passwordHash: "secret" });
  assert.equal("pinHash" in result, false);
  assert.equal("passwordHash" in result, false);
});

test("una fuente sin sincronizacion vigente no expone resultados anteriores", () => {
  const result = serializeDataSource({
    id: "source-1",
    type: "HORARIOS",
    provider: "EXCEL",
    name: "Horarios tienda",
    url: "https://example.com/horarios.xlsx",
    status: "DISCONNECTED",
    frequency: "DAILY",
    lastSyncAt: null,
    nextSyncAt: null,
    syncLogs: [{
      status: "SUCCESS",
      message: encodeSyncLogMessage("Sincronizacion completada", [{ name: "Hoja1", rowCount: 20 }]),
      recordsProcessed: 20,
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    }]
  });

  assert.equal(result.latestLog, null);
});
