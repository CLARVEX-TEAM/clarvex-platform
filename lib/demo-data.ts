import type { Announcement, DayPlan, Kpi, LogEntry, Pending, ScheduleShift, User } from "@/lib/types";

export const users: User[] = [
  { id: "itzel", name: "Itzel", employeeNumber: "81893", role: "GERENTE", avatar: "IT" },
  { id: "adrian", name: "Adrian", employeeNumber: "102259", role: "SUBGERENTE", avatar: "AD" },
  { id: "waira", name: "Waira", employeeNumber: "95739", role: "ASESOR", avatar: "WA" },
  { id: "jazmin", name: "Jazmin", employeeNumber: "93383", role: "ASESOR", avatar: "JA" },
  { id: "alonso", name: "Alonso", employeeNumber: "113642", role: "ASESOR", avatar: "AL" }
];

export const kpis: Kpi[] = [
  { userId: "waira", dailySales: 18400, monthlySales: 256800, dailyGoal: 22000, monthlyGoal: 360000, avgTicket: 1840, upt: 2.7, conversion: 34, pieces: 27, transactions: 10, ranking: 1, grossSales: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 552, commissionPercent: 3 },
  { userId: "jazmin", dailySales: 16250, monthlySales: 231400, dailyGoal: 21000, monthlyGoal: 345000, avgTicket: 1477, upt: 2.2, conversion: 29, pieces: 24, transactions: 11, ranking: 2, grossSales: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 406.25, commissionPercent: 2.5 },
  { userId: "alonso", dailySales: 13100, monthlySales: 204900, dailyGoal: 20500, monthlyGoal: 330000, avgTicket: 1638, upt: 2.0, conversion: 25, pieces: 16, transactions: 8, ranking: 3, grossSales: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 262, commissionPercent: 2 },
  { userId: "itzel", dailySales: 49750, monthlySales: 694200, dailyGoal: 64000, monthlyGoal: 1080000, avgTicket: 1642, upt: 2.3, conversion: 30, pieces: 67, transactions: 30, ranking: 0, grossSales: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0 },
  { userId: "adrian", dailySales: 49750, monthlySales: 694200, dailyGoal: 64000, monthlyGoal: 1080000, avgTicket: 1642, upt: 2.3, conversion: 30, pieces: 67, transactions: 30, ranking: 0, grossSales: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0 }
];

export const plans: DayPlan[] = [
  {
    id: "plan-waira",
    userId: "waira",
    date: "2026-06-05",
    dailyGoal: 22000,
    focus: "Elevar conversion en probador y cerrar accesorios.",
    message: "Waira, hoy cuida cada entrada: saluda rapido, detecta necesidad y ofrece segundo look.",
    activities: [
      { id: "a1", title: "Revisar tablero de metas al iniciar turno", completed: true },
      { id: "a2", title: "Enviar 3 opciones completas a probador", completed: false },
      { id: "a3", title: "Confirmar tallas faltantes con inventario", completed: false }
    ]
  },
  {
    id: "plan-jazmin",
    userId: "jazmin",
    date: "2026-06-05",
    dailyGoal: 21000,
    focus: "Ticket promedio con venta por conjunto.",
    message: "Jazmin, tu energia ayuda al piso. Prioriza clientes con compra para evento.",
    activities: [
      { id: "a4", title: "Actualizar acomodo de mesa principal", completed: true },
      { id: "a5", title: "Sugerir complemento en cada cierre", completed: true },
      { id: "a6", title: "Registrar oportunidades perdidas", completed: false }
    ]
  },
  {
    id: "plan-alonso",
    userId: "alonso",
    date: "2026-06-05",
    dailyGoal: 20500,
    focus: "Prospeccion en piso y seguimiento a clientes indecisos.",
    message: "Alonso, busca velocidad en contacto inicial y seguimiento por nombre.",
    activities: [
      { id: "a7", title: "Validar precios y promociones antes de apertura", completed: true },
      { id: "a8", title: "Contactar 5 clientes de lista caliente", completed: false },
      { id: "a9", title: "Reportar quiebres de talla al cierre", completed: false }
    ]
  }
];

export const pendings: Pending[] = [
  { id: "p1", title: "Validar exhibicion de entrada", description: "Alinear volumen, tallas y precios visibles antes de apertura.", category: "comercial", priority: "alta", ownerId: "adrian", status: "en proceso", dueDate: "2026-06-05" },
  { id: "p2", title: "Seguimiento a reparacion de luz", description: "Zona de probadores con luminaria intermitente.", category: "mantenimiento", priority: "critica", ownerId: "itzel", status: "pendiente", dueDate: "2026-06-06" },
  { id: "p3", title: "Conteo selectivo", description: "Revisar diferencias en accesorios y reportar ajuste.", category: "inventario", priority: "media", ownerId: "alonso", status: "pendiente", dueDate: "2026-06-07" },
  { id: "p4", title: "Handover de gerencia", description: "Concentrado de temas abiertos para regreso de vacaciones.", category: "equipo", priority: "alta", ownerId: "adrian", status: "pendiente", dueDate: "2026-06-08" }
];

export const logEntries: LogEntry[] = [
  { id: "b1", date: "2026-06-05T10:12:00", authorId: "adrian", category: "Apertura", description: "Equipo completo, piso listo y caja verificada sin diferencias." },
  { id: "b2", date: "2026-06-05T13:40:00", authorId: "waira", category: "Cliente", description: "Cliente solicita apartado de talla especial. Se deja contacto y seguimiento." },
  { id: "b3", date: "2026-06-05T16:05:00", authorId: "alonso", category: "Inventario", description: "Se detectan faltantes de talla en linea basica. Pendiente validacion en bodega." }
];

export const announcements: Announcement[] = [
  { id: "c1", title: "Prioridad de cierre", body: "Hoy se revisa orden visual de mesas y reposicion completa antes de entregar turno.", authorId: "itzel", date: "2026-06-05", readBy: ["waira", "jazmin"] },
  { id: "c2", title: "Cambio operativo", body: "Registrar pendientes criticos en handover antes de las 20:30.", authorId: "adrian", date: "2026-06-05", readBy: ["waira"] }
];

export const schedules: ScheduleShift[] = [
  { id: "s1", userId: "waira", day: "Lun", start: "10:00", end: "18:00", zone: "Piso" },
  { id: "s2", userId: "waira", day: "Mar", start: "12:00", end: "20:00", zone: "Probadores" },
  { id: "s3", userId: "waira", day: "Mie", start: "Descanso", end: "", zone: "" },
  { id: "s4", userId: "waira", day: "Jue", start: "11:00", end: "19:00", zone: "Caja apoyo" },
  { id: "s5", userId: "waira", day: "Vie", start: "13:00", end: "21:00", zone: "Piso" },
  { id: "s6", userId: "jazmin", day: "Lun", start: "12:00", end: "20:00", zone: "Piso" },
  { id: "s7", userId: "jazmin", day: "Mar", start: "10:00", end: "18:00", zone: "Entrada" },
  { id: "s8", userId: "alonso", day: "Lun", start: "13:00", end: "21:00", zone: "Piso" },
  { id: "s9", userId: "alonso", day: "Mar", start: "11:00", end: "19:00", zone: "Bodega apoyo" }
];

export const advisors = users.filter((user) => user.role === "ASESOR");

export function money(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}

export function completion(current: number, goal: number) {
  return Math.round((current / goal) * 100);
}

export function userName(id: string) {
  return users.find((user) => user.id === id)?.name ?? "Equipo";
}
