import assert from "node:assert/strict";
import test from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertSafeTestEnvironment } from "../helpers";

/**
 * Aislamiento entre tiendas **por la API de verdad**.
 *
 * ⚠️ **Por qué existe, teniendo ya `aislamiento.test.ts`.** Aquel comprueba
 * consultas de Prisma con el filtro escrito DENTRO de la propia prueba: demuestra
 * que Postgres sabe filtrar, que no estaba en duda. Una ruta que se olvidara del
 * `storeId` seguiría pasando la CI entera, que es justo el fallo que se quiere
 * impedir.
 *
 * Aquí se levanta la aplicación real, se inicia sesión con el PIN de la gerencia
 * de una tienda y se piden datos por HTTP. El filtro que se prueba es el que
 * escribe la ruta, no el de la prueba.
 *
 * ⚠️ **Las dos direcciones se comprueban.** Una aserción de «no aparece nadie de
 * la otra tienda» la cumple también una respuesta vacía o un servidor roto. Antes
 * se confirma contra la base que los datos ajenos EXISTEN, y después que los
 * propios SÍ vienen en la respuesta. Sin esas dos, la prueba pasa sin probar.
 *
 * ⚠️ **Solo corre donde el seed ya dejó las dos tiendas sintéticas**, que hoy es
 * el Postgres efímero del trabajo `integracion`. Y se comprueba MIRANDO la base,
 * no por una variable: en una máquina de desarrollo con `.env.test` configurado,
 * `TEST_DATABASE_URL` existe igual, así que ese candado no sujetaba nada — esta
 * suite llegó a levantar un servidor de verdad contra una base local. Si faltan
 * las tiendas, se salta sin arrancar nada; que el seed no haya corrido lo dice
 * `aislamiento.test.ts`, que sí lo afirma.
 */

let saltar = !process.env.TEST_DATABASE_URL;
let motivoSalto = "sin TEST_DATABASE_URL";

const NORTE = "TEST-STORE-001";
const SUR = "TEST-STORE-002";
const PUERTO = "3102";
const RAIZ = `http://127.0.0.1:${PUERTO}`;

/** Todo lo que identifica a la tienda vecina dentro de una respuesta JSON. */
const HUELLAS_AJENAS = [SUR, "test-manager-2", "test-advisor-3", "TEST-GER-002", "TEST-ADV-003"];

let prisma: PrismaClient;
let servidor: ChildProcess | null = null;
let registroServidor = "";
let descriptorRegistro: number | null = null;

/**
 * Apaga el servidor de pruebas.
 *
 * ⚠️ **`next dev` NO es el servidor: lo BIFURCA.** Matar al hijo deja vivo al
 * nieto (`next-server`), que heredó las tuberías de salida; mientras esas
 * tuberías sigan abiertas, el bucle de eventos del proceso de pruebas no se
 * vacía y el ejecutor no termina nunca. En Windows no se nota --la prueba salía
 * en doce segundos-- pero en Linux costó **19 minutos colgada** hasta agotar el
 * tiempo del trabajo, con las cinco pruebas ya en verde.
 *
 * Dos medidas, y cada una basta por su cuenta:
 *
 *   - La salida va a un FICHERO, no a tuberías. El proceso de pruebas no
 *     sostiene ningún descriptor del servidor, sobreviva quien sobreviva.
 *   - En POSIX el hijo se lanza como líder de su grupo (`detached`) y se mata
 *     el GRUPO entero con el pid en negativo, así que el nieto se va con él.
 */
function apagarServidor(): void {
  if (servidor) {
    try {
      if (process.platform !== "win32" && servidor.pid) process.kill(-servidor.pid, "SIGKILL");
      else servidor.kill("SIGKILL");
    } catch {
      // Ya no estaba.
    }
    servidor.unref();
    servidor = null;
  }
  if (descriptorRegistro !== null) {
    try {
      fs.closeSync(descriptorRegistro);
    } catch {
      // Ya cerrado.
    }
    descriptorRegistro = null;
  }
}

/** Lo último del registro del servidor. Sin tuberías, esta es la única pista. */
function colaDelRegistro(lineas = 25): string {
  try {
    return fs.readFileSync(registroServidor, "utf8").split(/\r?\n/).slice(-lineas).join("\n");
  } catch {
    return "(sin registro del servidor)";
  }
}

async function esperarAlServidor(intentos = 120): Promise<boolean> {
  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      const respuesta = await fetch(`${RAIZ}/api/health`);
      await respuesta.text();
      // Cualquier respuesta sirve: lo que se espera es que ATIENDA, no que la
      // base esté sana. `next dev` compila bajo demanda y tarda en el primer hit.
      return true;
    } catch {
      // Todavía no levanta.
    }
    await new Promise((listo) => setTimeout(listo, 1000));
  }
  return false;
}

function galleta(cabeceras: Headers): string | null {
  const puesta = cabeceras.get("set-cookie");
  if (!puesta) return null;
  const casa = puesta.match(/clarvex\.session=([^;]+)/);
  return casa ? `clarvex.session=${casa[1]}` : null;
}

async function entrar(numeroEmpleado: string): Promise<string> {
  const respuesta = await fetch(`${RAIZ}/api/auth/employee-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", employeeNumber: numeroEmpleado, pin: "1234" })
  });
  const cuerpo = await respuesta.text();
  assert.equal(respuesta.status, 200, `login de ${numeroEmpleado}: ${respuesta.status} ${cuerpo}`);
  const cookie = galleta(respuesta.headers);
  assert.ok(cookie, `el login de ${numeroEmpleado} no devolvió sesión`);
  return cookie;
}

test.before(async () => {
  if (saltar) return;
  assertSafeTestEnvironment();
  prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

  // El candado de verdad: sin las tiendas del seed no hay nada que aislar, y
  // levantar un servidor contra una base ajena no es una prueba, es un riesgo.
  const sembradas = await prisma.store
    .findMany({ where: { id: { in: [NORTE, SUR] } }, select: { id: true } })
    .catch(() => []);
  if (sembradas.length < 2) {
    saltar = true;
    motivoSalto = "la base no tiene las dos tiendas sintéticas del seed";
    await prisma.$disconnect();
    return;
  }

  /*
   * ⚠️ `next dev` FUERZA `NODE_ENV=development`, así que al hijo se le retira
   * `ALLOW_INTEGRATION_TEST_DATABASE` y se le entrega `DATABASE_URL` explícita:
   * el guardia de `lib/prisma.ts` exige que esas dos vayan juntas y, con el par
   * descompensado, abortaba cada petición con un 500. Es seguro porque para
   * llegar aquí ya pasó `assertSafeTestEnvironment()`.
   *
   * Y se lanza el binario local con el propio Node, no con `npx`: es idéntico en
   * las tres plataformas y `kill()` mata al servidor y no a un intérprete que lo
   * deja huérfano ocupando el puerto.
   */
  const binarioNext = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  registroServidor = path.join(os.tmpdir(), `clarvex-aislamiento-${process.pid}.log`);
  descriptorRegistro = fs.openSync(registroServidor, "w");
  servidor = spawn(process.execPath, [binarioNext, "dev", "-p", PUERTO], {
    // Ver `apagarServidor`: sin tuberías y como líder de grupo en POSIX.
    detached: process.platform !== "win32",
    stdio: ["ignore", descriptorRegistro, descriptorRegistro],
    env: {
      ...process.env,
      NODE_ENV: "development",
      ALLOW_INTEGRATION_TEST_DATABASE: undefined,
      PORT: PUERTO,
      DATABASE_URL: process.env.TEST_DATABASE_URL
    }
  });

  if (!(await esperarAlServidor())) {
    const cola = colaDelRegistro();
    apagarServidor();
    assert.fail(`el servidor de pruebas no levantó a tiempo. Últimas líneas:\n${cola}`);
  }
});

test.after(async () => {
  apagarServidor();
  if (!saltar && prisma) await prisma.$disconnect();
  // El registro se imprime siempre: es barato y es lo único que queda del
  // servidor cuando una prueba falla en el runner.
  if (registroServidor) console.log(`[servidor de pruebas] últimas líneas:\n${colaDelRegistro(15)}`);
});

test("⚠️ la tienda vecina EXISTE en la base (si no, lo de abajo no prueba nada)", async (t) => {
  if (saltar) return t.skip(motivoSalto);

  const vecinos = await prisma.user.count({ where: { storeId: SUR } });
  assert.ok(vecinos > 0, "el seed tiene que dejar gente en la tienda vecina");
});

test("⚠️ /api/app-data no devuelve NADA de la tienda vecina", async (t) => {
  if (saltar) return t.skip(motivoSalto);

  const cookie = await entrar("TEST-GER-001");
  const respuesta = await fetch(`${RAIZ}/api/app-data`, { headers: { Cookie: cookie } });
  const crudo = await respuesta.text();
  assert.equal(respuesta.status, 200, crudo.slice(0, 400));

  /*
   * Lo propio SÍ viene: sin esto, una respuesta vacía pasaría la prueba.
   *
   * ⚠️ Se comprueba con los identificadores de las PERSONAS, no con el de la
   * tienda: `app-data` no serializa `storeId` --lo sabe por la sesión-- así que
   * exigirlo hacía fallar la prueba por su propia aserción y no por un fallo de
   * aislamiento. El id de tienda se queda abajo, entre las huellas ajenas, donde
   * solo puede sobrar.
   */
  assert.ok(crudo.includes("test-manager-1"), "la gerencia de su propia tienda tiene que venir");
  assert.ok(crudo.includes("test-advisor-1"), "sus asesores tienen que venir");

  // Y lo ajeno no aparece por ningún lado de la carga útil.
  for (const huella of HUELLAS_AJENAS) {
    assert.ok(!crudo.includes(huella), `la respuesta trae "${huella}", que es de la tienda vecina`);
  }
});

test("⚠️ pedir a alguien de OTRA tienda por su id no lo encuentra", async (t) => {
  if (saltar) return t.skip(motivoSalto);

  // Es la forma del fallo real: el identificador viaja en la petición y la
  // tienda sale de la sesión. La gerencia del norte pide a un asesor del sur.
  const cookie = await entrar("TEST-GER-001");
  const respuesta = await fetch(`${RAIZ}/api/ai/coach-advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ userId: "test-advisor-3" })
  });
  const cuerpo = await respuesta.text();
  assert.equal(respuesta.status, 404, cuerpo.slice(0, 400));
  assert.ok(!cuerpo.includes("Asesor Test Sur"), "no puede filtrarse ni el nombre");
});

test("⚠️ tampoco se le puede ASIGNAR trabajo a alguien de otra tienda", async (t) => {
  if (saltar) return t.skip(motivoSalto);

  // La lectura no es el único lado: una escritura que acepte un `ownerId` ajeno
  // deja una fila de una tienda apuntando a una persona de otra.
  const cookie = await entrar("TEST-GER-001");
  const respuesta = await fetch(`${RAIZ}/api/pendings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      title: "Pendiente de prueba de aislamiento",
      description: "No debe crearse: el responsable es de otra tienda.",
      category: "OPERACION",
      priority: "MEDIA",
      ownerId: "test-advisor-3",
      dueDate: "2030-01-01"
    })
  });
  const cuerpo = await respuesta.text();
  assert.equal(respuesta.status, 400, cuerpo.slice(0, 400));

  // Y se comprueba en la base, no solo por el código: la fila no existe.
  const creado = await prisma.pending.findFirst({ where: { ownerId: "test-advisor-3" } });
  assert.equal(creado, null, "se creó un pendiente para alguien de la tienda vecina");
});

test("cada tienda ve la SUYA: la gerencia del sur recibe sus propios datos", async (t) => {
  if (saltar) return t.skip(motivoSalto);

  // El aislamiento no puede ser «no devolver nada». La otra dirección tiene que
  // funcionar igual de bien, o lo que se estaría probando es una API rota.
  const cookie = await entrar("TEST-GER-002");
  const respuesta = await fetch(`${RAIZ}/api/app-data`, { headers: { Cookie: cookie } });
  const crudo = await respuesta.text();
  assert.equal(respuesta.status, 200, crudo.slice(0, 400));

  assert.ok(crudo.includes("test-manager-2"), "la gerencia del sur tiene que verse a sí misma");
  assert.ok(crudo.includes("test-advisor-3"), "su asesor tiene que venir");
  for (const huella of [NORTE, "test-manager-1", "test-advisor-1", "TEST-GER-001"]) {
    assert.ok(!crudo.includes(huella), `la respuesta del sur trae "${huella}", que es del norte`);
  }
});
