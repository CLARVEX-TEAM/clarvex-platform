import { PrismaClient } from "@prisma/client";

import fs from "node:fs";
import path from "node:path";

const isTestEnvironment = process.env.NODE_ENV === "test";
const integrationTestsAllowed = process.env.ALLOW_INTEGRATION_TEST_DATABASE === "true";

if (isTestEnvironment !== integrationTestsAllowed) {
  throw new Error("Configuracion de pruebas inconsistente: NODE_ENV=test y ALLOW_INTEGRATION_TEST_DATABASE=true deben activarse juntos.");
}

if (isTestEnvironment && integrationTestsAllowed) {
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

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("ERROR DE SEGURIDAD: TEST_DATABASE_URL no está configurada.");
  }
  if (!testUrl.includes("test")) {
    throw new Error("ERROR DE SEGURIDAD: La base de datos de pruebas debe contener la palabra 'test' en su nombre.");
  }
  process.env.DATABASE_URL = testUrl;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
