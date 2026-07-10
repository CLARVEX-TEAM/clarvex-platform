import { PrismaClient } from "@prisma/client";
import { assertSafeTestEnvironment } from "./helpers";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function seedTestDatabase() {
  // 1. Double check we are in a safe test environment
  assertSafeTestEnvironment();

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

  console.log("✔ Test database seeded successfully.");
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
