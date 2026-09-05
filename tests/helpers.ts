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

  /*
   * ⚠️ **El nombre no basta, y el HOST tampoco es un detalle.**
   *
   * `clarvex_team_test` contiene «test» y pasa la comprobación de arriba. Si esa
   * base viviera en el servidor de producción, el seed la truncaría igual. Las
   * pruebas corren contra una base local y efímera; apuntar a una remota es un
   * error de configuración, no una opción.
   *
   * Se puede levantar a propósito con `TEST_DB_ALLOW_REMOTE=1`, pero tiene que
   * ser una decisión escrita, no el valor por omisión.
   */
  let host = "";
  try {
    host = new URL(testDbUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const esLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
  if (!esLocal && process.env.TEST_DB_ALLOW_REMOTE !== "1") {
    throw new Error(
      `ERROR DE SEGURIDAD: TEST_DATABASE_URL apunta a un host remoto ("${host}"). ` +
        "Las pruebas borran tablas enteras. Usa una base local, o pon TEST_DB_ALLOW_REMOTE=1 si de verdad es lo que quieres."
    );
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

  /*
   * ⚠️ **Y no solo usuarios.** Una base con cero usuarios reales pero con
   * tiendas o KPIs de verdad sigue siendo una base que no se puede truncar. Un
   * volcado restaurado a medias, o una base que alguien apuntó por error, se ve
   * exactamente así.
   *
   * Las tiendas sintéticas llevan el prefijo `test-`; cualquier otra es motivo
   * suficiente para no borrar nada.
   */
  /*
   * ⚠️ El prefijo es `TEST-` en MAYUSCULAS, igual que el de los usuarios y que
   * el que escribe `seed-test-db.ts`. Con `test-` en minusculas, la propia
   * tienda sintetica del seed no casaba y la SEGUNDA ejecucion abortaba
   * diciendo que habia datos reales.
   */
  const tiendaReal = await prisma.store.findFirst({
    where: { NOT: { id: { startsWith: "TEST-" } } },
    select: { id: true, name: true }
  });

  if (tiendaReal) {
    throw new Error(
      `ERROR DE SEGURIDAD CRÍTICA: Hay una tienda que no es sintética en la base de pruebas: ` +
        `${tiendaReal.name} (${tiendaReal.id}). Abortando antes de borrar nada.`
    );
  }
}
