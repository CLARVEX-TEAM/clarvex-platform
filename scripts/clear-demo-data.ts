import { prisma } from "@/lib/prisma";

async function main() {
  const [announcements, pendings] = await Promise.all([
    prisma.announcement.deleteMany({}),
    prisma.pending.deleteMany({}),
  ]);

  console.log(`Comunicados eliminados: ${announcements.count}`);
  console.log(`Pendientes eliminados:  ${pendings.count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
