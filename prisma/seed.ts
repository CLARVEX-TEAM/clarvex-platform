import { PrismaClient, Role, PendingCategory, PendingPriority, PendingStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const store = await prisma.store.upsert({
    where: { id: "clarvex-demo-store" },
    update: {},
    create: { id: "clarvex-demo-store", name: "CLARVEX Demo Store" }
  });

  const people = [
    ["itzel", "ITZEL SAIDY REYES BAUTISTA", "itzel@clarvex.local", "81893", Role.GERENTE],
    ["adrian", "JESUS ADRIAN HERNANDEZ LUNA", "adrian@clarvex.local", "102259", Role.SUBGERENTE],
    ["waira", "WAIRA ZITLALI POPOCA", "waira@clarvex.local", "95739", Role.ASESOR],
    ["jazmin", "JAZMIN CASTRO ZUÑIGA", "jazmin@clarvex.local", "96383", Role.ASESOR],
    ["alonso", "ALONSO TREVIÑO", "alonso@clarvex.local", "113642", Role.ASESOR]
  ] as const;

  for (const [id, name, email, employeeNumber, role] of people) {
    await prisma.user.upsert({
      where: { email },
      update: { name, employeeNumber, role, storeId: store.id, biometricEnabled: false },
      create: { id, name, email, employeeNumber, role, passwordHash: null, pinHash: null, photoUrl: null, biometricEnabled: false, storeId: store.id }
    });
  }

  await prisma.evidence.deleteMany({ where: { storeId: store.id } });
  await prisma.dataSource.deleteMany({ where: { storeId: store.id } });
  await prisma.pending.deleteMany({ where: { storeId: store.id } });
  await prisma.schedule.deleteMany({ where: { storeId: store.id } });
  await prisma.dayPlan.deleteMany({ where: { storeId: store.id } });
  await prisma.storeLog.deleteMany({ where: { storeId: store.id } });
  await prisma.announcement.deleteMany({ where: { storeId: store.id } });

  const today = new Date("2026-06-05T12:00:00.000Z");
  const commissionRules = [
      { storeId: store.id, role: Role.ASESOR, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53 },
      { storeId: store.id, role: Role.ASESOR, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91 },
      { storeId: store.id, role: Role.ASESOR, minAchievement: 115, commissionPercent: 2.29 },
      { storeId: store.id, role: Role.SUBGERENTE, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93 },
      { storeId: store.id, role: Role.SUBGERENTE, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16 },
      { storeId: store.id, role: Role.SUBGERENTE, minAchievement: 115, commissionPercent: 1.39 },
      { storeId: store.id, role: Role.GERENTE, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.25 },
      { storeId: store.id, role: Role.GERENTE, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.56 },
      { storeId: store.id, role: Role.GERENTE, minAchievement: 115, commissionPercent: 1.87 }
  ];
  for (const rule of commissionRules) {
    const existing = await prisma.commissionRule.findFirst({
      where: { storeId: rule.storeId, role: rule.role, minAchievement: rule.minAchievement, maxAchievement: rule.maxAchievement ?? null }
    });
    const data = { ...rule, minSales: 0, maxSales: null, active: true };
    if (existing) await prisma.commissionRule.update({ where: { id: existing.id }, data });
    else await prisma.commissionRule.create({ data });
  }

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
      { userId: "waira", storeId: store.id, date: new Date("2026-06-01T00:00:00.000Z"), day: "Lun", startTime: "10:00", endTime: "18:00", zone: "Piso", weekStart: new Date("2026-05-31T00:00:00.000Z") },
      { userId: "waira", storeId: store.id, date: new Date("2026-06-05T00:00:00.000Z"), day: "Vie", startTime: "13:00", endTime: "21:00", zone: "Piso", weekStart: new Date("2026-05-31T00:00:00.000Z") },
      { userId: "jazmin", storeId: store.id, date: new Date("2026-06-05T00:00:00.000Z"), day: "Vie", startTime: "10:00", endTime: "18:00", zone: "Entrada", weekStart: new Date("2026-05-31T00:00:00.000Z") },
      { userId: "alonso", storeId: store.id, date: new Date("2026-06-05T00:00:00.000Z"), day: "Vie", startTime: "11:00", endTime: "19:00", zone: "Bodega apoyo", weekStart: new Date("2026-05-31T00:00:00.000Z") }
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
