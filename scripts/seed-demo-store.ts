import { PrismaClient } from "@prisma/client";
import { seedDemoStore } from "../lib/demo-seed";

// Siembra/refresca la tienda demo pública (demo-showcase). Seguro en producción:
// solo toca esa tienda. Uso: pnpm exec tsx scripts/seed-demo-store.ts
const prisma = new PrismaClient();

seedDemoStore(prisma)
  .then((store) => console.log(`Tienda demo lista: ${store.name} (${store.id})`))
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
