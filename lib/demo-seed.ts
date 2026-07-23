import type { PrismaClient } from "@prisma/client";
import { AttendanceStatus, PendingCategory, PendingPriority, PendingStatus, Role, ScheduleStatus } from "@prisma/client";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";
import { DEMO_ADVISOR_EMPLOYEE, DEMO_MANAGER_EMPLOYEE, DEMO_STORE_ID } from "@/lib/demo";

/**
 * Siembra (o refresca) la tienda DEMO pública `demo-showcase` con datos 100%
 * ficticios. Es IDEMPOTENTE y SEGURA PARA PRODUCCIÓN: solo toca esa tienda,
 * nunca datos reales. Las tablas con fecha (KPIs, horarios, asistencia, planes)
 * se re-siembran con la fecha de HOY para que el dashboard nunca salga vacío —
 * por eso también la llama un cron diario.
 */
export async function seedDemoStore(prisma: PrismaClient) {
  const store = await prisma.store.upsert({
    where: { id: DEMO_STORE_ID },
    update: { name: "Boutique Aurora (Demo)", billingExempt: true },
    create: { id: DEMO_STORE_ID, name: "Boutique Aurora (Demo)", billingExempt: true }
  });

  const people = [
    { id: "demo-sofia", name: "Sofía Ramírez", email: "sofia@demo.clarvex", employeeNumber: DEMO_MANAGER_EMPLOYEE, role: Role.GERENTE, hoursOwed: -60 },
    { id: "demo-mateo", name: "Mateo Luna", email: "mateo@demo.clarvex", employeeNumber: DEMO_ADVISOR_EMPLOYEE, role: Role.ASESOR, hoursOwed: 150 },
    { id: "demo-valeria", name: "Valeria Cruz", email: "valeria@demo.clarvex", employeeNumber: "DEMO-202", role: Role.ASESOR, hoursOwed: 0 },
    { id: "demo-emiliano", name: "Emiliano Ríos", email: "emiliano@demo.clarvex", employeeNumber: "DEMO-203", role: Role.ASESOR, hoursOwed: 30 },
    { id: "demo-renata", name: "Renata Solís", email: "renata@demo.clarvex", employeeNumber: "DEMO-204", role: Role.ASESOR, hoursOwed: 0 }
  ];
  for (const p of people) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: { name: p.name, employeeNumber: p.employeeNumber, role: p.role, storeId: store.id, isDemo: true, active: true, checklistOnly: false, platformAdmin: false, hoursOwed: p.hoursOwed },
      create: { id: p.id, name: p.name, email: p.email, employeeNumber: p.employeeNumber, role: p.role, storeId: store.id, isDemo: true, hoursOwed: p.hoursOwed, biometricEnabled: false, pinHash: null }
    });
  }

  // Brackets de comisión (mismos que el estándar de la cadena).
  const rules = [
    { role: Role.ASESOR, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.53 },
    { role: Role.ASESOR, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.91 },
    { role: Role.ASESOR, minAchievement: 115, maxAchievement: null, commissionPercent: 2.29 },
    { role: Role.SUBGERENTE, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 0.93 },
    { role: Role.SUBGERENTE, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.16 },
    { role: Role.SUBGERENTE, minAchievement: 115, maxAchievement: null, commissionPercent: 1.39 },
    { role: Role.GERENTE, minAchievement: 0, maxAchievement: 99.99, commissionPercent: 1.25 },
    { role: Role.GERENTE, minAchievement: 100, maxAchievement: 114.99, commissionPercent: 1.56 },
    { role: Role.GERENTE, minAchievement: 115, maxAchievement: null, commissionPercent: 1.87 }
  ];
  for (const rule of rules) {
    const existing = await prisma.commissionRule.findFirst({
      where: { storeId: store.id, role: rule.role, minAchievement: rule.minAchievement, maxAchievement: rule.maxAchievement ?? null }
    });
    const data = { storeId: store.id, ...rule, minSales: 0, maxSales: null, active: true };
    if (existing) await prisma.commissionRule.update({ where: { id: existing.id }, data });
    else await prisma.commissionRule.create({ data });
  }

  // Fecha de HOY tal como la busca el dashboard (rango [00:00Z, +24h) del día MX).
  const { start: today } = dashboardDateRange(dashboardDateKey());
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const dayAbbr = today.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" }).replace(".", "");

  // Se re-siembran las tablas con fecha (solo de la tienda demo).
  await prisma.kpi.deleteMany({ where: { storeId: store.id } });
  await prisma.schedule.deleteMany({ where: { storeId: store.id } });
  await prisma.attendance.deleteMany({ where: { storeId: store.id } });
  await prisma.dayPlan.deleteMany({ where: { storeId: store.id } });
  await prisma.pending.deleteMany({ where: { storeId: store.id } });
  await prisma.announcement.deleteMany({ where: { storeId: store.id } });

  const kpis = [
    { userId: "demo-mateo", dailySales: 6820, dailyGoal: 5400, monthlySales: 148900, monthlyGoal: 132000, avgTicket: 1750, upt: 2.6, transactions: 4, pieces: 10, ranking: 1, commissionMinimum: 126000, traffic: null as number | null },
    { userId: "demo-valeria", dailySales: 5110, dailyGoal: 5200, monthlySales: 121400, monthlyGoal: 128000, avgTicket: 1460, upt: 2.1, transactions: 4, pieces: 8, ranking: 2, commissionMinimum: 111000, traffic: null },
    { userId: "demo-emiliano", dailySales: 4260, dailyGoal: 5000, monthlySales: 98700, monthlyGoal: 120000, avgTicket: 1420, upt: 2.0, transactions: 3, pieces: 6, ranking: 3, commissionMinimum: 104000, traffic: null },
    { userId: "demo-renata", dailySales: 0, dailyGoal: 0, monthlySales: 76000, monthlyGoal: 118000, avgTicket: 0, upt: 0, transactions: 0, pieces: 0, ranking: 0, commissionMinimum: 102000, traffic: null },
    { userId: "demo-sofia", dailySales: 4260, dailyGoal: 5000, monthlySales: 118500, monthlyGoal: 130000, avgTicket: 1420, upt: 2.3, transactions: 3, pieces: 6, ranking: 0, commissionMinimum: 110000, traffic: 60 }
  ];
  for (const k of kpis) {
    await prisma.kpi.create({ data: { ...k, storeId: store.id, date: today, conversion: null } });
  }

  const schedule = [
    { userId: "demo-sofia", status: ScheduleStatus.WORKING, startTime: "10:00", endTime: "19:00", zone: "Gerencia" },
    { userId: "demo-mateo", status: ScheduleStatus.WORKING, startTime: "11:00", endTime: "20:00", zone: "Piso" },
    { userId: "demo-valeria", status: ScheduleStatus.WORKING, startTime: "10:00", endTime: "18:00", zone: "Entrada" },
    { userId: "demo-emiliano", status: ScheduleStatus.WORKING, startTime: "12:00", endTime: "21:00", zone: "Probadores" },
    { userId: "demo-renata", status: ScheduleStatus.OFF, startTime: null, endTime: null, zone: null }
  ];
  for (const s of schedule) {
    await prisma.schedule.create({ data: { userId: s.userId, storeId: store.id, date: today, day: dayAbbr, startTime: s.startTime, endTime: s.endTime, zone: s.zone, weekStart: today, status: s.status } });
  }

  // Retardos del mes (para la tarjeta "Mi quincena"). El banco de horas sale del
  // hoursOwed de cada usuario (Mateo +2:30, Sofía −1:00).
  const lates = [
    { userId: "demo-mateo", day: 3 },
    { userId: "demo-sofia", day: 4 },
    { userId: "demo-sofia", day: 11 }
  ];
  for (const l of lates) {
    await prisma.attendance.create({
      data: {
        storeId: store.id,
        userId: l.userId,
        date: new Date(Date.UTC(year, month, l.day)),
        status: AttendanceStatus.LATE,
        minutesLate: 20,
        minutesBalance: 0,
        expectedAt: "10:00",
        arrivedAt: "10:22",
        source: "MANUAL",
        note: "Llegada tarde registrada"
      }
    });
  }

  await prisma.dayPlan.create({
    data: {
      userId: "demo-mateo",
      storeId: store.id,
      date: today,
      publishedAt: today,
      dailyGoal: 5400,
      focus: "Elevar conversión en probador y cerrar accesorios.",
      message: "Cuida cada entrada: saluda rápido, detecta necesidad y ofrece un segundo look.",
      activities: {
        create: [
          { title: "Revisar tablero de metas al iniciar turno", completed: true },
          { title: "Enviar 3 opciones completas a probador" },
          { title: "Sugerir un accesorio en cada cierre" }
        ]
      }
    }
  });

  await prisma.pending.createMany({
    data: [
      { storeId: store.id, title: "Validar exhibición de entrada", description: "Alinear volumen, tallas y precios visibles antes de apertura.", category: PendingCategory.COMERCIAL, priority: PendingPriority.ALTA, ownerId: "demo-mateo", status: PendingStatus.EN_PROCESO, dueDate: today },
      { storeId: store.id, title: "Seguimiento a reparación de luz", description: "Zona de probadores con luminaria intermitente.", category: PendingCategory.MANTENIMIENTO, priority: PendingPriority.CRITICA, ownerId: "demo-sofia", status: PendingStatus.PENDIENTE, dueDate: today }
    ]
  });

  const announcement = await prisma.announcement.create({
    data: { storeId: store.id, authorId: "demo-sofia", title: "Meta de cierre de mes", body: "Vamos al 92%. Empujemos accesorios en cada ticket para cerrar fuerte esta quincena." }
  });
  await prisma.announcement.create({
    data: { storeId: store.id, authorId: "demo-sofia", title: "Nuevo acomodo de vitrina", body: "Cambiamos el look de entrada. Revisar antes de abrir y reponer tallas faltantes." }
  });
  await prisma.announcementRead.createMany({
    data: [
      { announcementId: announcement.id, userId: "demo-mateo" },
      { announcementId: announcement.id, userId: "demo-valeria" }
    ]
  });

  return store;
}
