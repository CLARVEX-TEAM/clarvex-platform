import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestEnvironment, assertSafeDatabaseRecords } from "./helpers";
import { PrismaClient } from "@prisma/client";

// Define baseline environment variables for the safety tests in CI/environments where .env.test is not present
process.env.ALLOW_INTEGRATION_TEST_DATABASE = "true";
process.env.TEST_DATABASE_URL = "postgresql://localhost/clarvex_test";

test("assertSafeTestEnvironment rechaza NODE_ENV != 'test'", () => {
  const origNodeEnv = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = "production";
  try {
    assert.throws(() => assertSafeTestEnvironment(), /NODE_ENV=test/);
  } finally {
    (process.env as any).NODE_ENV = origNodeEnv;
  }
});

test("assertSafeTestEnvironment rechaza ALLOW_INTEGRATION_TEST_DATABASE != 'true'", () => {
  const origAllow = process.env.ALLOW_INTEGRATION_TEST_DATABASE;
  process.env.ALLOW_INTEGRATION_TEST_DATABASE = "false";
  try {
    assert.throws(() => assertSafeTestEnvironment(), /ALLOW_INTEGRATION_TEST_DATABASE/);
  } finally {
    process.env.ALLOW_INTEGRATION_TEST_DATABASE = origAllow;
  }
});

test("assertSafeTestEnvironment rechaza ausencia de TEST_DATABASE_URL", () => {
  const origUrl = process.env.TEST_DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
  try {
    assert.throws(() => assertSafeTestEnvironment(), /TEST_DATABASE_URL/);
  } finally {
    process.env.TEST_DATABASE_URL = origUrl;
  }
});

test("assertSafeTestEnvironment rechaza base de datos sin la palabra 'test'", () => {
  const origUrl = process.env.TEST_DATABASE_URL;
  process.env.TEST_DATABASE_URL = "postgresql://clarvex:123@localhost:5432/clarvex_team?schema=public";
  try {
    assert.throws(() => assertSafeTestEnvironment(), /contener la palabra 'test'/);
  } finally {
    process.env.TEST_DATABASE_URL = origUrl;
  }
});

test("assertSafeTestEnvironment rechaza base de datos que coincide con la de producción", () => {
  const origUrl = process.env.TEST_DATABASE_URL;
  const origDbUrl = process.env.DATABASE_URL;
  
  // Set both to a simulated production DB URL to trigger the match assertion
  const prodUrl = "postgresql://clarvex:CambiaEstaPasswordSegura123@localhost:5432/clarvex_team?schema=public";
  process.env.TEST_DATABASE_URL = prodUrl;
  process.env.DATABASE_URL = prodUrl;
  
  try {
    assert.throws(() => assertSafeTestEnvironment(), /coincide con la base de datos de producción/);
  } finally {
    process.env.TEST_DATABASE_URL = origUrl;
    process.env.DATABASE_URL = origDbUrl;
  }
});

test("assertSafeDatabaseRecords rechaza base de datos con usuarios reales (sin prefijo TEST-)", async () => {
  // Mock PrismaClient where findFirst returns a real user
  const mockPrisma = {
    user: {
      findFirst: async (args: any) => {
        return {
          id: "u1",
          name: "Waira",
          employeeNumber: "95739" // No empieza con TEST-
        };
      }
    }
  } as unknown as PrismaClient;

  await assert.rejects(
    async () => assertSafeDatabaseRecords(mockPrisma),
    /registros reales de producción/
  );
});

test("assertSafeDatabaseRecords acepta base de datos con solo usuarios de pruebas (TEST-)", async () => {
  // Ni usuarios reales ni tiendas reales: la base es sintetica y se puede
  // truncar. Las DOS consultas tienen que devolver null.
  const mockPrisma = {
    user: { findFirst: async () => null },
    store: { findFirst: async () => null }
  } as unknown as PrismaClient;

  await assertSafeDatabaseRecords(mockPrisma);
});

test("⚠️ una TIENDA que no es sintetica tambien aborta el borrado", async () => {
  /*
   * El usuario no es lo unico que importa. Una base con cero usuarios reales
   * pero con tiendas de verdad --un volcado restaurado a medias, una base
   * apuntada por error-- sigue siendo una base que no se puede truncar.
   */
  const mockPrisma = {
    user: { findFirst: async () => null },
    store: { findFirst: async () => ({ id: "clarvex-demo-store", name: "TH SAN AGUSTIN" }) }
  } as unknown as PrismaClient;

  await assert.rejects(
    async () => assertSafeDatabaseRecords(mockPrisma),
    /no es sintética/
  );
});
