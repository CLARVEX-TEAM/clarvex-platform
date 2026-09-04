import { PrismaClient } from "@prisma/client";
import { assertSafeDatabaseRecords, assertSafeTestEnvironment } from "./helpers";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function seedTestDatabase() {
  /*
   * ⚠️ **DOS comprobaciones, y la segunda es la que faltaba.**
   *
   * `assertSafeTestEnvironment` mira la URL: que exista `TEST_DATABASE_URL`, que
   * el nombre lleve «test» y que no sea la base principal. Eso NO basta: una
   * base llamada `clarvex_team_test` con datos reales dentro pasa esa
   * comprobación y el `TRUNCATE ... CASCADE` de abajo se los lleva todos.
   *
   * `assertSafeDatabaseRecords` mira el CONTENIDO: si hay un usuario sin
   * prefijo `TEST-` o una tienda que no sea sintética, se aborta antes de
   * borrar nada. La comprobación ya existía y el seed no la llamaba.
   */
  assertSafeTestEnvironment();
  await assertSafeDatabaseRecords(prisma);

  console.log("Cleaning test database...");
  
  // Dynamic cascade truncate for all public tables (except migrations)
  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`
  );

  if (tables.length > 0) {
    const tableNames = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} CASCADE;`);
  }

  console.log("Seeding test database with synthetic records...");

  // Create store
  const store = await prisma.store.create({
    data: {
      id: "TEST-STORE-001",
      name: "Tienda Test Norte",
      billingExempt: true
    }
  });

  const pinHash = await bcrypt.hash("1234", 12);

  // Create Manager
  await prisma.user.create({
    data: {
      id: "test-manager-1",
      name: "Gerente Test",
      email: "test-ger-001@clarvex.local",
      employeeNumber: "TEST-GER-001",
      role: "GERENTE",
      storeId: store.id,
      pinHash,
      active: true
    }
  });

  // Create Advisor with PIN
  await prisma.user.create({
    data: {
      id: "test-advisor-1",
      name: "Asesor Test Uno",
      email: "test-adv-001@clarvex.local",
      employeeNumber: "TEST-ADV-001",
      role: "ASESOR",
      storeId: store.id,
      pinHash,
      active: true
    }
  });

  // Create Advisor without PIN (for activation flows)
  await prisma.user.create({
    data: {
      id: "test-advisor-2",
      name: "Asesor Test Dos",
      email: "test-adv-002@clarvex.local",
      employeeNumber: "TEST-ADV-002",
      role: "ASESOR",
      storeId: store.id,
      pinHash: null,
      active: true
    }
  });

  // Create Platform Admin
  await prisma.user.create({
    data: {
      id: "test-admin-1",
      name: "Admin Test",
      email: "test-adm-001@clarvex.local",
      employeeNumber: "TEST-ADM-001",
      role: "GERENTE",
      storeId: store.id,
      pinHash,
      platformAdmin: true,
      active: true
    }
  });

  /*
   * ⚠️ **Una SEGUNDA tienda, y con datos propios.**
   *
   * Con una sola no se puede probar lo que de verdad importa: que una tienda no
   * vea la de al lado. Una prueba de aislamiento contra una base con un solo
   * inquilino pasa siempre, y no demuestra nada.
   *
   * Los identificadores llevan el prefijo `TEST-` como todo lo demas: es lo que
   * `assertSafeDatabaseRecords` usa para saber que la base se puede borrar.
   */
  const tiendaVecina = await prisma.store.create({
    data: {
      id: "TEST-STORE-002",
      name: "Tienda Test Sur",
      billingExempt: true
    }
  });

  await prisma.user.create({
    data: {
      id: "test-manager-2",
      employeeNumber: "TEST-GER-002",
      email: "test-ger-002@clarvex.local",
      name: "Gerente Test Sur",
      pinHash,
      role: "GERENTE",
      storeId: tiendaVecina.id,
      active: true
    }
  });

  await prisma.user.create({
    data: {
      id: "test-advisor-3",
      employeeNumber: "TEST-ADV-003",
      email: "test-adv-003@clarvex.local",
      name: "Asesor Test Sur",
      pinHash,
      role: "ASESOR",
      storeId: tiendaVecina.id,
      active: true
    }
  });

  console.log("✔ Test database seeded successfully (2 tiendas sintéticas).");
}

if (require.main === module) {
  seedTestDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
