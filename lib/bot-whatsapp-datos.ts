import { prisma } from "@/lib/prisma";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";
import { PERSON_WHERE } from "@/lib/store-people";
import type { ContextoBot, TurnoBot, VentaBot } from "@/lib/bot-whatsapp-contexto";

/**
 * Las consultas detrás del contexto del bot. Todo se filtra por la persona que
 * escribe --y por su tienda--; la venta de tienda solo la pide gerencia.
 */

const DIA_MS = 86_400_000;
const GERENCIA = new Set(["GERENTE", "SUBGERENTE"]);

/**
 * Hay captura cuando hubo operación, no cuando solo está la meta: Cuota Justa
 * escribe la meta de la semana entera por adelantado con la venta en cero. La
 * venta puede ser NEGATIVA por una devolución, y eso sí es captura.
 */
const CON_CAPTURA = {
  OR: [{ transactions: { gt: 0 } }, { pieces: { gt: 0 } }, { dailySales: { not: 0 } }]
};

async function ventaDelMes(where: Record<string, unknown>, inicio: Date, fin: Date): Promise<VentaBot> {
  const rango = { date: { gte: inicio, lte: fin } };
  const [metas, ventas, ultima] = await Promise.all([
    prisma.kpi.aggregate({ where: { ...where, ...rango }, _sum: { dailyGoal: true } }),
    prisma.kpi.aggregate({ where: { ...where, ...rango }, _sum: { dailySales: true } }),
    prisma.kpi.findFirst({ where: { ...where, ...rango, ...CON_CAPTURA }, orderBy: { date: "desc" }, select: { date: true } })
  ]);
  return {
    meta: Number(metas._sum.dailyGoal ?? 0),
    venta: Number(ventas._sum.dailySales ?? 0),
    ultimaCaptura: ultima?.date ?? null
  };
}

export async function contextoDelEmpleado(opciones: {
  userId: string;
  storeId: string;
  hoy: Date;
  cursos: string[];
  tareaFija: string;
}): Promise<ContextoBot> {
  const { userId, storeId, hoy } = opciones;
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
  const rol = usuario?.role ?? "ASESOR";
  const mes = retailMonthBoundsFor(hoy);

  const [turnos, ventaPersonal, ventaTienda, pendientes, comunicados, dias] = await Promise.all([
    // ⚠️ Por `date`, nunca por `day`: la tabla guarda semanas viejas con el mismo
    // nombre de día, y ya excluyó a alguien que sí trabajaba.
    prisma.schedule.findMany({
      where: { userId, storeId, date: { gte: hoy, lt: new Date(hoy.getTime() + 4 * DIA_MS) } },
      orderBy: { date: "asc" },
      select: { date: true, status: true, startTime: true, endTime: true }
    }),
    ventaDelMes({ userId, storeId }, mes.start, mes.end),
    GERENCIA.has(rol) ? ventaDelMes({ storeId, user: PERSON_WHERE }, mes.start, mes.end) : Promise.resolve(null),
    prisma.pending.findMany({
      where: { ownerId: userId, storeId, status: { not: "COMPLETADO" } },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: { title: true, dueDate: true }
    }),
    prisma.announcement.findMany({
      where: {
        storeId,
        createdAt: { gte: new Date(hoy.getTime() - 7 * DIA_MS) },
        reads: { none: { userId } }
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { title: true }
    }),
    prisma.kpi.findMany({
      where: { userId, storeId, date: { gte: mes.start, lte: mes.end }, ...CON_CAPTURA },
      orderBy: { date: "asc" },
      select: { date: true, dailySales: true, dailyGoal: true }
    })
  ]);

  return {
    nombre: usuario?.name ?? "compañero",
    rol,
    hoy,
    turnos: turnos.map(
      (t): TurnoBot => ({ fecha: t.date, status: t.status, inicio: t.startTime, fin: t.endTime })
    ),
    ventaPersonal,
    ventaTienda,
    ventaPorDia: dias.map((d) => ({ fecha: d.date, venta: Number(d.dailySales), meta: Number(d.dailyGoal) })),
    pendientes: pendientes.map((p) => ({ titulo: p.title, vence: p.dueDate })),
    comunicadosSinLeer: comunicados.map((a) => a.title),
    cursos: opciones.cursos,
    tareaFija: opciones.tareaFija
  };
}
