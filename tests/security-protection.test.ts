import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestEnvironment, assertSafeDatabaseRecords } from "./helpers";
import { PrismaClient } from "@prisma/client";

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
  // Mock PrismaClient where findFirst returns null (no users violate the TEST- rule)
  const mockPrisma = {
    user: {
      findFirst: async (args: any) => {
        return null;
      }
    }
  } as unknown as PrismaClient;

  // Should complete successfully without throwing
  await assertSafeDatabaseRecords(mockPrisma);
});
