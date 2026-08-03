import assert from "node:assert/strict";
import test from "node:test";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import { assertSafeTestEnvironment, assertSafeDatabaseRecords } from "../helpers";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TEST_PORT = "3101";
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Helper to wait for the server to be responsive
async function waitForServer(url: string, retries = 30): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { method: "GET" });
      await res.text(); // Consume body
      if (res.ok || res.status === 200 || res.status === 404) return true;
    } catch {
      // Ignore fetch errors while server is starting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

test("Suite de pruebas de integración con servidor de test aislado", async (t) => {
  // 1. Asegurar que estamos en un entorno de pruebas seguro y conectado a clarvex_test
  assertSafeTestEnvironment();
  await assertSafeDatabaseRecords(prisma);

  console.log(`[test] Iniciando servidor Next.js de desarrollo en puerto ${TEST_PORT}...`);
  
  // 2. Levantar el servidor en puerto separado
  // Se lanza el binario local de Next con el propio Node en vez de `npx`.
  // En Windows `spawn("npx")` falla con ENOENT (spawn no aplica PATHEXT) y
  // `spawn("npx.cmd")` con EINVAL, porque Node bloquea lanzar .cmd sin shell
  // desde la corrección de CVE-2024-27980. Usar `shell: true` lo sortearía,
  // pero entonces `kill()` mata al intérprete y deja el servidor huérfano
  // ocupando el puerto. Esta vía es idéntica en Windows, Linux y el VPS.
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const serverProcess = spawn(process.execPath, [nextBin, "dev", "-p", TEST_PORT], {
    env: {
      ...process.env,
      // `next dev` FUERZA NODE_ENV=development: el hijo nunca estará en modo
      // test por mucho que se lo pasemos. Si encima heredara
      // ALLOW_INTEGRATION_TEST_DATABASE=true, el guardia de lib/prisma.ts vería
      // el par descompensado ("deben activarse juntos") y abortaría cada
      // petición con un 500. Por eso se retira aquí.
      //
      // La base de pruebas se le entrega explícita. Es seguro: para llegar a
      // esta línea ya pasó assertSafeTestEnvironment(), que exige que
      // TEST_DATABASE_URL exista, contenga "test" y NO coincida con la
      // DATABASE_URL de .env. Y Next no pisa variables ya presentes en el
      // entorno al cargar los .env, así que este valor manda.
      NODE_ENV: "development",
      ALLOW_INTEGRATION_TEST_DATABASE: undefined,
      PORT: TEST_PORT,
      DATABASE_URL: process.env.TEST_DATABASE_URL
    }
  });

  // Track logs for debugging
  serverProcess.stdout?.on("data", (data) => {
    console.log(`[server stdout]: ${data}`);
  });
  serverProcess.stderr?.on("data", (data) => {
    console.error(`[server stderr]: ${data}`);
  });

  try {
    const isUp = await waitForServer(BASE_URL);
    assert.ok(isUp, "El servidor de pruebas no levantó a tiempo.");
    console.log(`[test] Servidor listo en ${BASE_URL}`);

    // Helper para extraer cookies
    const getCookie = (headers: Headers) => {
      const setCookie = headers.get("set-cookie");
      if (!setCookie) return null;
      const match = setCookie.match(/clarvex\.session=([^;]+)/);
      return match ? `clarvex.session=${match[1]}` : null;
    };

    await t.test("Inicio de sesión de asesor con PIN existente (TEST-ADV-001)", async () => {
      const loginRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", employeeNumber: "TEST-ADV-001", pin: "1234" })
      });
      assert.equal(loginRes.status, 200);
      await loginRes.text(); // Consume body
      const cookie = getCookie(loginRes.headers);
      assert.ok(cookie);
    });

    await t.test("Inicio de sesión de gerente (TEST-GER-001)", async () => {
      const loginRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", employeeNumber: "TEST-GER-001", pin: "1234" })
      });
      assert.equal(loginRes.status, 200);
      await loginRes.text(); // Consume body
    });

    await t.test("Asesor tiene prohibido consultar el perfil de otro asesor (cross-user)", async () => {
      // Login as advisor
      const loginRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", employeeNumber: "TEST-ADV-001", pin: "1234" })
      });
      const cookie = getCookie(loginRes.headers);
      await loginRes.text(); // Consume body

      // Attempt query advisor 2
      const coachRes = await fetch(`${BASE_URL}/api/ai/coach-advisor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookie!
        },
        body: JSON.stringify({ userId: "test-advisor-2" })
      });
      assert.equal(coachRes.status, 403);
      const coachData = await coachRes.json();
      assert.match(coachData.error, /No tienes permiso/);
    });

    await t.test("PIN setup anónimo de usuario nuevo (TEST-ADV-002) es rechazado", async () => {
      const setupRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", employeeNumber: "TEST-ADV-002", pin: "4321" })
      });
      assert.equal(setupRes.status, 403);
      const setupData = await setupRes.json();
      assert.match(setupData.error, /El setup del PIN requiere autorización/);
    });

    await t.test("PIN setup de usuario nuevo es exitoso bajo sesión de gerente", async () => {
      // Login as manager
      const loginRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", employeeNumber: "TEST-GER-001", pin: "1234" })
      });
      const cookie = getCookie(loginRes.headers);
      await loginRes.text(); // Consume body

      // Setup PIN
      const setupRes = await fetch(`${BASE_URL}/api/auth/employee-login`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Cookie": cookie!
        },
        body: JSON.stringify({ action: "setup", employeeNumber: "TEST-ADV-002", pin: "4321" })
      });
      assert.equal(setupRes.status, 200);
      await setupRes.text(); // Consume body

      // Clean up after test
      await prisma.user.update({
        where: { employeeNumber: "TEST-ADV-002" },
        data: { pinHash: null }
      });
    });

  } finally {
    console.log("[test] Deteniendo servidor de pruebas...");
    serverProcess.kill("SIGKILL");
    await prisma.$disconnect();
    setTimeout(() => {
      process.exit(process.exitCode || 0);
    }, 1000);
  }
});
