import { prisma } from "@/lib/prisma";
import { retailMonthBoundsFor } from "@/lib/report-deadlines";
import { PERSON_WHERE } from "@/lib/store-people";
import { buildCommissionPerson, type CommissionPersonInternal } from "@/lib/commission-read";
import { getKpiReport } from "@/lib/services/kpi-service";
import type { Role } from "@/lib/types";
import { armarDias, type ComisionBot, type ContextoBot, type TurnoBot, type VentaBot } from "@/lib/bot-whatsapp-contexto";

/**
 * Las consultas detrás del contexto del bot. Todo se filtra por la persona que
 * escribe --y por su tienda--; la venta de tienda y las comisiones del equipo
 * solo las pide gerencia, igual que en la app.
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

const clave = (fecha: Date) => fecha.toISOString().slice(0, 10);

async function ventaDelMes(where: Record<string, unknown>, inicio: Date, fin: Date, ultimaCaptura: Date | null): Promise<VentaBot> {
  const rango = { date: { gte: inicio, lte: fin } };
  const suma = await prisma.kpi.aggregate({ where: { ...where, ...rango }, _sum: { dailyGoal: true, dailySales: true } });
  return {
    meta: Number(suma._sum.dailyGoal ?? 0),
    venta: Number(suma._sum.dailySales ?? 0),
    ultimaCaptura
  };
}

function aComision(p: CommissionPersonInternal, nombre?: string): ComisionBot {
  return {
    nombre: nombre ?? p.name,
    venta: p.sales,
    minimo: p.minimum,
    alcance: p.achievementVsMinimum,
    porcentaje: p.commissionPercent,
    monto: p.commissionAmount,
    tieneMinimo: p.hasMinimum,
    siguiente: p.nextBracket && !p.nextBracket.atTop ? { faltan: p.nextBracket.salesNeeded, porcentaje: p.nextBracket.nextPercent } : null
  };
}

/**
 * La comisión sale del MISMO informe que la pestaña KPIs → Comisión
 * (`getKpiReport` + `buildCommissionPerson`): el bot no puede dar un número
 * distinto al de la app. Gerencia comisiona sobre la venta de tienda, como en
 * la app, y además ve la de cada asesor.
 */
async function comisiones(opciones: { userId: string; storeId: string; rol: Role; nombre: string; hoy: Date }) {
  const report = await getKpiReport(
    { userId: opciones.userId, storeId: opciones.storeId, role: opciones.rol, name: opciones.nombre, employeeNumber: "", platformAdmin: false },
    { period: "month", selectedDate: opciones.hoy }
  );
  const reglas = report.commissionRules;
  const base = report.commissionBasis;
  if (opciones.rol === "ASESOR") {
    return { propia: report.own ? aComision(buildCommissionPerson(report.own, reglas, "ASESOR", base), "Su comisión") : null, equipo: [] };
  }
  if (!GERENCIA.has(opciones.rol) || !report.store) return { propia: null, equipo: [] };
  const propia = aComision(buildCommissionPerson({ ...report.store, userName: "Tienda" }, reglas, opciones.rol, base), `Su comisión (${opciones.rol}, sobre venta de tienda)`);
  const equipo = report.team
    .filter((item) => item.role === "ASESOR")
    .map((item) => aComision(buildCommissionPerson(item, reglas, "ASESOR", base)));
  return { propia, equipo };
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
  const rol = (usuario?.role ?? "ASESOR") as Role;
  const mes = retailMonthBoundsFor(hoy);
  const enMes = { date: { gte: mes.start, lte: mes.end } };

  const [turnos, pendientes, comunicados, capturasTienda, filas, horarios, comision] = await Promise.all([
    // ⚠️ Por `date`, nunca por `day`: la tabla guarda semanas viejas con el mismo
    // nombre de día, y ya excluyó a alguien que sí trabajaba.
    prisma.schedule.findMany({
      where: { userId, storeId, date: { gte: hoy, lt: new Date(hoy.getTime() + 4 * DIA_MS) } },
      orderBy: { date: "asc" },
      select: { date: true, status: true, startTime: true, endTime: true }
    }),
    prisma.pending.findMany({
      where: { ownerId: userId, storeId, status: { not: "COMPLETADO" } },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: { title: true, dueDate: true }
    }),
    prisma.announcement.findMany({
      where: { storeId, createdAt: { gte: new Date(hoy.getTime() - 7 * DIA_MS) }, reads: { none: { userId } } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { title: true }
    }),
    // Qué días capturó la TIENDA: un día sin venta de esta persona puede estar
    // capturado igual (no vendió), y eso es distinto de «falta capturarlo».
    prisma.kpi.findMany({ where: { storeId, ...enMes, ...CON_CAPTURA }, distinct: ["date"], select: { date: true } }),
    prisma.kpi.findMany({ where: { userId, storeId, ...enMes }, select: { date: true, dailySales: true, dailyGoal: true } }),
    prisma.schedule.findMany({ where: { userId, storeId, ...enMes }, select: { date: true, status: true } }),
    comisiones({ userId, storeId, rol, nombre: usuario?.name ?? "", hoy }).catch((error) => {
      console.error("[bot-whatsapp] comisión", error instanceof Error ? error.message : error);
      return { propia: null, equipo: [] };
    })
  ]);

  const capturados = new Set(capturasTienda.map((k) => clave(k.date)));
  const ultimaTienda = capturasTienda.reduce<Date | null>((max, k) => (!max || k.date > max ? k.date : max), null);
  const [ventaPersonal, ventaTienda] = await Promise.all([
    ventaDelMes({ userId, storeId }, mes.start, mes.end, ultimaTienda),
    GERENCIA.has(rol) ? ventaDelMes({ storeId, user: PERSON_WHERE }, mes.start, mes.end, ultimaTienda) : Promise.resolve(null)
  ]);

  return {
    nombre: usuario?.name ?? "compañero",
    rol,
    hoy,
    turnos: turnos.map((t): TurnoBot => ({ fecha: t.date, status: t.status, inicio: t.startTime, fin: t.endTime })),
    ventaPersonal,
    ventaTienda,
    ventaPorDia: armarDias({
      inicio: mes.start,
      hasta: ultimaTienda,
      capturados,
      filas: new Map(filas.map((f) => [clave(f.date), { venta: Number(f.dailySales), meta: Number(f.dailyGoal) }])),
      horarios: new Map(horarios.map((h) => [clave(h.date), h.status as string]))
    }),
    comision: comision.propia,
    equipo: comision.equipo,
    pendientes: pendientes.map((p) => ({ titulo: p.title, vence: p.dueDate })),
    comunicadosSinLeer: comunicados.map((a) => a.title),
    cursos: opciones.cursos,
    tareaFija: opciones.tareaFija
  };
}
