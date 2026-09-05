import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const TEST_URL = "postgresql://localhost/clarvex_test";
const LOCAL_URL = "postgresql://localhost/clarvex_team";
const envPath = path.resolve(process.cwd(), ".env");
const envTestPath = path.resolve(process.cwd(), ".env.test");
const fixtures = new Map<string, string>();
const originalEnv = { ...process.env };
let helpers: typeof import("./helpers");

// Mock before importing: these unit tests must never load the developer's env files.
test.before(async () => {
  const existsSync = fs.existsSync;
  const readFileSync = fs.readFileSync;
  test.mock.method(fs, "existsSync", (file: fs.PathLike) => {
    const filename = String(file);
    if (filename === envPath || filename === envTestPath) return fixtures.has(filename);
    return existsSync(file);
  });
  test.mock.method(fs, "readFileSync", ((...args: Parameters<typeof fs.readFileSync>) => {
    const filename = String(args[0]);
    if (filename === envPath || filename === envTestPath) {
      assert.ok(fixtures.has(filename), "only synthetic env fixtures may be read");
      return fixtures.get(filename)!;
    }
    return readFileSync(...args);
  }) as typeof fs.readFileSync);
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "true";
  process.env.TEST_DATABASE_URL = TEST_URL;
  process.env.DATABASE_URL = TEST_URL;
  helpers = await import("./helpers");
});

test.beforeEach(() => {
  fixtures.clear();
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "true";
  process.env.TEST_DATABASE_URL = TEST_URL;
  process.env.DATABASE_URL = TEST_URL;
  delete process.env.TEST_DB_ALLOW_REMOTE;
});

test.after(() => {
  test.mock.restoreAll();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

test("acepta la base efimera de CI sin .env y con ambas URLs iguales", () => {
  assert.doesNotThrow(() => helpers.assertSafeTestEnvironment());
  assert.doesNotThrow(() => helpers.assertSafeTestEnvironment());
});

test("acepta una base de pruebas distinta de la configuracion local", () => {
  fixtures.set(envPath, `DATABASE_URL=${LOCAL_URL}\n`);
  assert.doesNotThrow(() => helpers.assertSafeTestEnvironment());
});

test("rechaza NODE_ENV distinto de test", () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.throws(() => helpers.assertSafeTestEnvironment(), /NODE_ENV=test/);
});

test("rechaza la ausencia de consentimiento explicito", () => {
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "false";
  assert.throws(() => helpers.assertSafeTestEnvironment(), /ALLOW_INTEGRATION_TEST_DATABASE/);
});

test("rechaza la ausencia de TEST_DATABASE_URL", () => {
  delete process.env.TEST_DATABASE_URL;
  assert.throws(() => helpers.assertSafeTestEnvironment(), /TEST_DATABASE_URL/);
});

test("rechaza el nombre de la base principal aunque ambas URLs coincidan", () => {
  process.env.TEST_DATABASE_URL = LOCAL_URL;
  process.env.DATABASE_URL = LOCAL_URL;
  assert.throws(() => helpers.assertSafeTestEnvironment(), /contener la palabra 'test'/);
});

test("rechaza un nombre sin test aunque el usuario de la URL lo contenga", () => {
  process.env.TEST_DATABASE_URL = "postgresql://test-user@localhost/operacion";
  assert.throws(() => helpers.assertSafeTestEnvironment(), /contener la palabra 'test'/);
});

test("rechaza la URL configurada en .env incluso si el nombre contiene test", () => {
  fixtures.set(envPath, `DATABASE_URL="${TEST_URL}"\n`);
  assert.throws(() => helpers.assertSafeTestEnvironment(), /coincide con la base de datos de producción/);
});

test("no usa DATABASE_URL del proceso para ocultar una coincidencia en .env", () => {
  fixtures.set(envPath, `DATABASE_URL='${TEST_URL}'\n`);
  process.env.DATABASE_URL = "postgresql://localhost/otra_test";
  assert.throws(() => helpers.assertSafeTestEnvironment(), /coincide con la base de datos de producción/);
});

test("rechaza una base remota sin autorizacion adicional", () => {
  process.env.TEST_DATABASE_URL = "postgresql://db.example.invalid/clarvex_test";
  assert.throws(() => helpers.assertSafeTestEnvironment(), /host remoto/);
});

test("rechaza usuarios no sinteticos antes de permitir limpiar la base", async () => {
  const prisma = {
    user: { findFirst: async () => ({ id: "fixture-user", name: "Fixture", employeeNumber: "NON-SYNTHETIC" }) }
  } as unknown as PrismaClient;
  await assert.rejects(helpers.assertSafeDatabaseRecords(prisma), /registros reales de producción/);
});

test("acepta registros sinteticos en el mismo entorno efimero de CI", async () => {
  const prisma = {
    user: { findFirst: async () => null },
    store: { findFirst: async () => null }
  } as unknown as PrismaClient;
  await helpers.assertSafeDatabaseRecords(prisma);
});

test("rechaza una tienda no sintetica aunque no existan usuarios reales", async () => {
  const prisma = {
    user: { findFirst: async () => null },
    store: { findFirst: async () => ({ id: "fixture-store", name: "Fixture" }) }
  } as unknown as PrismaClient;
  await assert.rejects(helpers.assertSafeDatabaseRecords(prisma), /no es sintética/);
});
