import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { assertSafeTestEnvironment } from "../helpers";

/**
 * Aislamiento entre tiendas, contra una base de verdad.
 *
 * ⚠️ **Solo corre en CI, con el Postgres efimero del trabajo `integracion`.**
 * Necesita `TEST_DATABASE_URL` apuntando a una base local, desechable y ya
 * sembrada con las dos tiendas sinteticas. En una maquina de desarrollo no hay
 * garantia de eso, y `seed-test-db.ts` hace `TRUNCATE ... CASCADE`.
 *
 * ⚠️ Lo que se prueba NO es que las pantallas escondan datos, sino que la
 * CONSULTA no los devuelva. Esconder en el cliente deja el dato viajando por la
 * red, y es exactamente lo que un `storeId` manipulado en la peticion saltaria.
 */

const SALTAR = !process.env.TEST_DATABASE_URL;

const NORTE = "TEST-STORE-001";
const SUR = "TEST-STORE-002";

let prisma: PrismaClient;

test.before(() => {
  if (SALTAR) return;
  assertSafeTestEnvironment();
  prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
});

test.after(async () => {
  if (!SALTAR && prisma) await prisma.$disconnect();
});

test("el seed dejo DOS tiendas sinteticas", { skip: SALTAR }, async () => {
  const tiendas = await prisma.store.findMany({ orderBy: { id: "asc" }, select: { id: true } });
  assert.deepEqual(tiendas.map((t) => t.id), [NORTE, SUR]);
});

test("⚠️ una consulta acotada por tienda NO devuelve gente de la otra", async (t) => {
  if (SALTAR) return t.skip("sin TEST_DATABASE_URL");

  const delNorte = await prisma.user.findMany({ where: { storeId: NORTE }, select: { storeId: true } });
  assert.ok(delNorte.length > 0, "la tienda norte tiene gente");
  assert.equal(
    delNorte.every((u) => u.storeId === NORTE),
    true,
    "no puede colarse nadie del sur"
  );

  const delSur = await prisma.user.findMany({ where: { storeId: SUR }, select: { storeId: true } });
  assert.ok(delSur.length > 0, "la tienda sur tiene gente");
  assert.equal(delSur.every((u) => u.storeId === SUR), true);
});

test("⚠️ pedir a alguien por id ACOTANDO por tienda no lo encuentra si es de otra", async (t) => {
  if (SALTAR) return t.skip("sin TEST_DATABASE_URL");

  // Es la forma del fallo real: el identificador viene de la peticion y la
  // tienda de la sesion. Sin el `storeId` en el `where`, esto devolveria a la
  // persona de la tienda de al lado.
  const ajeno = await prisma.user.findFirst({
    where: { id: "test-manager-2", storeId: NORTE },
    select: { id: true }
  });
  assert.equal(ajeno, null);

  const propio = await prisma.user.findFirst({
    where: { id: "test-manager-2", storeId: SUR },
    select: { id: true }
  });
  assert.equal(propio?.id, "test-manager-2");
});

test("los roles del seed son los esperados", { skip: SALTAR }, async () => {
  const gerentes = await prisma.user.count({ where: { role: "GERENTE" } });
  const asesores = await prisma.user.count({ where: { role: "ASESOR" } });
  assert.ok(gerentes >= 2, "un gerente por tienda");
  assert.ok(asesores >= 3);
});

test("⚠️ todos los usuarios sembrados llevan el prefijo TEST-", { skip: SALTAR }, async () => {
  // Es lo que `assertSafeDatabaseRecords` mira antes de dejar truncar. Si el
  // seed dejara de respetarlo, la siguiente siembra abortaria.
  const sinPrefijo = await prisma.user.findMany({
    where: { NOT: { employeeNumber: { startsWith: "TEST-" } } },
    select: { employeeNumber: true }
  });
  assert.deepEqual(sinPrefijo, []);
});

test("⚠️ y todas las tiendas tambien", { skip: SALTAR }, async () => {
  const sinPrefijo = await prisma.store.findMany({
    where: { NOT: { id: { startsWith: "TEST-" } } },
    select: { id: true }
  });
  assert.deepEqual(sinPrefijo, [], "una tienda sin prefijo bloquearia la siguiente siembra");
});
