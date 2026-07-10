import assert from "node:assert/strict";
import test from "node:test";
import { canManageDataSources } from "../lib/access-control";
import { canAccessAppData, canModifyPending, hashPin, publicUser, verifyPin, canSetupPin, canAccessAdvisorProfile } from "../lib/security";
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

test("canSetupPin requiere sesion de gerente/subgerente de la misma tienda", () => {
  const managerSameStore: Session = { userId: "m1", storeId: "store-a", role: "GERENTE", name: "Manager", employeeNumber: "1", platformAdmin: false };
  const submanagerSameStore: Session = { userId: "sm1", storeId: "store-a", role: "SUBGERENTE", name: "Submanager", employeeNumber: "2", platformAdmin: false };
  const advisorSameStore: Session = { userId: "a1", storeId: "store-a", role: "ASESOR", name: "Advisor", employeeNumber: "3", platformAdmin: false };
  const managerOtherStore: Session = { userId: "m2", storeId: "store-b", role: "GERENTE", name: "Other Manager", employeeNumber: "4", platformAdmin: false };
  const platformAdminSession: Session = { userId: "adm1", storeId: "store-b", role: "GERENTE", name: "Platform Admin", employeeNumber: "5", platformAdmin: true };

  assert.equal(canSetupPin(null, "store-a"), false);
  assert.equal(canSetupPin(advisorSameStore, "store-a"), false);
  assert.equal(canSetupPin(managerOtherStore, "store-a"), false);
  assert.equal(canSetupPin(managerSameStore, "store-a"), true);
  assert.equal(canSetupPin(submanagerSameStore, "store-a"), true);
  assert.equal(canSetupPin(platformAdminSession, "store-a"), true);
});

test("canAccessAdvisorProfile restringe el acceso apropiadamente", () => {
  const advisorA: Session = { userId: "a-1", storeId: "store-a", role: "ASESOR", name: "Advisor A", employeeNumber: "1", platformAdmin: false };
  const advisorB: Session = { userId: "a-2", storeId: "store-a", role: "ASESOR", name: "Advisor B", employeeNumber: "2", platformAdmin: false };
  const managerA: Session = { userId: "m-1", storeId: "store-a", role: "GERENTE", name: "Manager A", employeeNumber: "3", platformAdmin: false };
  const managerB: Session = { userId: "m-2", storeId: "store-b", role: "GERENTE", name: "Manager B", employeeNumber: "4", platformAdmin: false };
  const platformAdminSession: Session = { userId: "adm-1", storeId: "store-b", role: "ASESOR", name: "Platform Admin", employeeNumber: "5", platformAdmin: true };

  // Un asesor solo puede consultarse a sí mismo
  assert.equal(canAccessAdvisorProfile(advisorA, "a-1", "store-a"), true);
  assert.equal(canAccessAdvisorProfile(advisorA, "a-2", "store-a"), false);

  // Un gerente solo puede consultar asesores de su misma tienda
  assert.equal(canAccessAdvisorProfile(managerA, "a-1", "store-a"), true);
  assert.equal(canAccessAdvisorProfile(managerA, "a-2", "store-a"), true);
  assert.equal(canAccessAdvisorProfile(managerA, "a-3", "store-b"), false);

  // Un gerente de otra tienda no puede consultar el perfil
  assert.equal(canAccessAdvisorProfile(managerB, "a-1", "store-a"), false);

  // Platform admin puede consultar cualquier perfil
  assert.equal(canAccessAdvisorProfile(platformAdminSession, "a-1", "store-a"), true);
});
