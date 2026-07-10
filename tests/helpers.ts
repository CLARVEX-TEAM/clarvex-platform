import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

if (process.env.NODE_ENV === "test") {
  const envTestPath = path.resolve(process.cwd(), ".env.test");
  if (fs.existsSync(envTestPath)) {
    const lines = fs.readFileSync(envTestPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
  if (process.env.TEST_DATABASE_URL) {
    if (!process.env.TEST_DATABASE_URL.includes("test")) {
      throw new Error("ERROR DE SEGURIDAD: La base de datos de pruebas debe contener la palabra 'test' en su nombre.");
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}

// Function to read the main DATABASE_URL from .env file to prevent matching it
function getProdDatabaseUrl(): string | null {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
      if (match) return match[1].trim();
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function assertSafeTestEnvironment() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ERROR DE SEGURIDAD: Las pruebas solo se pueden ejecutar con NODE_ENV=test.");
  }

  if (process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "true") {
    throw new Error("ERROR DE SEGURIDAD: ALLOW_INTEGRATION_TEST_DATABASE debe ser 'true' para ejecutar estas pruebas.");
  }

  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    throw new Error("ERROR DE SEGURIDAD: TEST_DATABASE_URL no está configurada.");
  }

  const prodDbUrl = getProdDatabaseUrl() || process.env.DATABASE_URL;
  if (prodDbUrl && testDbUrl === prodDbUrl) {
    throw new Error("ERROR DE SEGURIDAD: TEST_DATABASE_URL coincide con la base de datos de producción.");
  }

  // Parse database name from URL
  let dbName = "";
  try {
    const parsed = new URL(testDbUrl);
    dbName = parsed.pathname.replace(/^\//, "").toLowerCase();
  } catch {
    // Fallback if URL parsing fails
    const match = testDbUrl.match(/\/([^?#]+)/);
    if (match) dbName = match[1].toLowerCase();
  }

  if (!dbName.includes("test")) {
    throw new Error(`ERROR DE SEGURIDAD: La base de datos de pruebas debe contener la palabra 'test' en su nombre. Detectado: "${dbName}".`);
  }

  if (dbName === "clarvex_team" || dbName === "clarvex") {
    throw new Error("ERROR DE SEGURIDAD: No se permite usar la base de datos principal de Clarvex para pruebas.");
  }
}

// Asserts database records are safe (only contains test users)
export async function assertSafeDatabaseRecords(prisma: PrismaClient) {
  assertSafeTestEnvironment();

  // Look for any user that does NOT start with "TEST-"
  const realUser = await prisma.user.findFirst({
    where: {
      NOT: {
        employeeNumber: {
          startsWith: "TEST-"
        }
      }
    },
    select: {
      id: true,
      name: true,
      employeeNumber: true
    }
  });

  if (realUser) {
    throw new Error(`ERROR DE SEGURIDAD CRÍTICA: Se detectaron registros reales de producción en la base de datos de pruebas. Usuario: ${realUser.name} (#${realUser.employeeNumber}). Abortando.`);
  }
}
