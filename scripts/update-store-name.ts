import { prisma } from "@/lib/prisma";

async function main() {
  const result = await prisma.store.updateMany({
    data: { name: "TH SAN AGUSTIN" }
  });
  console.log(`Tiendas actualizadas: ${result.count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
