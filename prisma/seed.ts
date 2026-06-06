import { PrismaClient, Role, PendingCategory, PendingPriority, PendingStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.upsert({
    where: { id: "clarvex-demo-store" },
    update: {},
    create: { id: "clarvex-demo-store", name: "CLARVEX Demo Store" }
  });

  const people = [
    ["itzel", "Itzel", "itzel@clarvex.local", "81893", Role.GERENTE],
    ["adrian", "Adrian", "adrian@clarvex.local", "102259", Role.SUBGERENTE],
    ["waira", "Waira", "waira@clarvex.local", "95739", Role.ASESOR],
    ["jazmin", "Jazmin", "jazmin@clarvex.local", "93383", Role.ASESOR],
    ["alonso", "Alonso", "alonso@clarvex.local", "113642", Role.ASESOR]
  ] as const;

  const passwordHash = await bcrypt.hash("demo1234", 10);

  for (const [id, name, email, employeeNumber, role] of people) {
    await prisma.user.upsert({
      where: { email },
      update: { name, employeeNumber, role, storeId: store.id, biometricEnabled: false },
      create: { id, name, email, employeeNumber, role, passwordHash, pinHash: null, photoUrl: null, biometricEnabled: false, storeId: store.id }
    });
  }

  await prisma.evidence.deleteMany({ where: { storeId: store.id } });
  await prisma.commissionRule.deleteMany({ where: { storeId: store.id } });
  await prisma.kpi.deleteMany({ where: { storeId: store.id } });
  await prisma.pending.deleteMany({ where: { storeId: store.id } });
  await prisma.schedule.deleteMany({ where: { storeId: store.id } });
  await prisma.dayPlan.deleteMany({ where: { storeId: store.id } });
  await prisma.storeLog.deleteMany({ where: { storeId: store.id } });
  await prisma.announcement.deleteMany({ where: { storeId: store.id } });

  const today = new Date("2026-06-05T12:00:00.000Z");
  await prisma.kpi.createMany({
    data: [
      { userId: "itzel", storeId: store.id, date: today, dailySales: 49750, monthlySales: 694200, dailyGoal: 64000, monthlyGoal: 1080000, avgTicket: 1642, upt: 2.3, conversion: 30, pieces: 67, transactions: 30, ranking: 0, discountMargin: 9, commissionAmount: 0, commissionPercent: 0 },
      { userId: "waira", storeId: store.id, date: today, dailySales: 18400, monthlySales: 256800, dailyGoal: 22000, monthlyGoal: 360000, avgTicket: 1840, upt: 2.7, conversion: 34, pieces: 27, transactions: 10, ranking: 1, discountMargin: 8, commissionAmount: 552, commissionPercent: 3 },
      { userId: "jazmin", storeId: store.id, date: today, dailySales: 16250, monthlySales: 231400, dailyGoal: 21000, monthlyGoal: 345000, avgTicket: 1477, upt: 2.2, conversion: 29, pieces: 24, transactions: 11, ranking: 2, discountMargin: 10, commissionAmount: 406.25, commissionPercent: 2.5 },
      { userId: "alonso", storeId: store.id, date: today, dailySales: 13100, monthlySales: 204900, dailyGoal: 20500, monthlyGoal: 330000, avgTicket: 1638, upt: 2.0, conversion: 25, pieces: 16, transactions: 8, ranking: 3, discountMargin: 12, commissionAmount: 262, commissionPercent: 2 },
      { userId: "adrian", storeId: store.id, date: today, dailySales: 49750, monthlySales: 694200, dailyGoal: 64000, monthlyGoal: 1080000, avgTicket: 1642, upt: 2.3, conversion: 30, pieces: 67, transactions: 30, ranking: 0, discountMargin: 9, commissionAmount: 0, commissionPercent: 0 }
    ]
  });

  await prisma.commissionRule.createMany({
    data: [
      { storeId: store.id, role: Role.ASESOR, minSales: 0, maxSales: 14999, minAchievement: 0, maxAchievement: 79.99, commissionPercent: 1.5 },
      { storeId: store.id, role: Role.ASESOR, minSales: 15000, maxSales: 24999, minAchievement: 80, maxAchievement: 99.99, commissionPercent: 2.5 },
      { storeId: store.id, role: Role.ASESOR, minSales: 25000, minAchievement: 100, commissionPercent: 3.5 }
    ]
  });

  const plan = await prisma.dayPlan.create({
    data: {
      userId: "waira",
      storeId: store.id,
      date: today,
      dailyGoal: 22000,
      focus: "Elevar conversion en probador y cerrar accesorios.",
      message: "Cuidar cada entrada, detectar necesidad y ofrecer segundo look.",
      activities: {
        create: [
          { title: "Revisar tablero de metas al iniciar turno", completed: true },
          { title: "Enviar 3 opciones completas a probador" },
          { title: "Confirmar tallas faltantes con inventario" }
        ]
      }
    }
  });

  await prisma.pending.createMany({
    data: [
      { storeId: store.id, title: "Validar exhibicion de entrada", description: "Alinear volumen, tallas y precios visibles antes de apertura.", category: PendingCategory.COMERCIAL, priority: PendingPriority.ALTA, ownerId: "adrian", status: PendingStatus.EN_PROCESO, dueDate: today },
      { storeId: store.id, title: "Seguimiento a reparacion de luz", description: "Zona de probadores con luminaria intermitente.", category: PendingCategory.MANTENIMIENTO, priority: PendingPriority.CRITICA, ownerId: "itzel", status: PendingStatus.PENDIENTE, dueDate: today }
    ]
  });

  await prisma.schedule.createMany({
    data: [
      { userId: "waira", storeId: store.id, day: "Lun", startTime: "10:00", endTime: "18:00", zone: "Piso", weekStart: today },
      { userId: "waira", storeId: store.id, day: "Vie", startTime: "13:00", endTime: "21:00", zone: "Piso", weekStart: today },
      { userId: "jazmin", storeId: store.id, day: "Vie", startTime: "10:00", endTime: "18:00", zone: "Entrada", weekStart: today },
      { userId: "alonso", storeId: store.id, day: "Vie", startTime: "11:00", endTime: "19:00", zone: "Bodega apoyo", weekStart: today }
    ]
  });

  const logEntry = await prisma.storeLog.create({
    data: { storeId: store.id, authorId: "adrian", category: "Apertura", description: "Equipo completo, piso listo y caja verificada sin diferencias." }
  });

  await prisma.evidence.create({
    data: {
      storeId: store.id,
      uploadedById: "adrian",
      logEntryId: logEntry.id,
      url: "/demo/evidencia-apertura.jpg",
      fileName: "evidencia-apertura.jpg",
      mimeType: "image/jpeg",
      note: "Referencia demo para futuras cargas de evidencia."
    }
  });

  const announcement = await prisma.announcement.create({
    data: { storeId: store.id, authorId: "itzel", title: "Prioridad de cierre", body: "Revisar orden visual de mesas y reposicion completa antes de entregar turno." }
  });

  await prisma.announcementRead.createMany({
    data: [
      { announcementId: announcement.id, userId: "waira" },
      { announcementId: announcement.id, userId: "jazmin" }
    ]
  });

  console.log(`Seed listo: ${store.name}, plan ${plan.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
