import { prisma } from "@/lib/prisma";
import { PERSON_WHERE } from "@/lib/store-people";
import {
  CAMPANA_ACTUAL,
  claveFecha,
  domingoDeSemana,
  fechasDeSemana,
  resumirSemana,
  type ResumenSemana
} from "@/lib/campana";

/** Las consultas de la campaña. Las cuentas viven en `lib/campana.ts`. */

const DIA_MS = 86_400_000;

export async function campanaActual() {
  return prisma.campaign.findUnique({ where: { slug: CAMPANA_ACTUAL } });
}

export async function resumenDeSemana(storeId: string, fecha: Date): Promise<ResumenSemana | null> {
  const campana = await campanaActual();
  if (!campana || !campana.active) return null;
  const inicio = domingoDeSemana(fecha);
  const fin = new Date(inicio.getTime() + 6 * DIA_MS);
  const [metas, aportes, personas] = await Promise.all([
    prisma.campaignGoal.findMany({ where: { campaignId: campana.id, storeId, date: { gte: inicio, lte: fin } } }),
    prisma.campaignEntry.findMany({ where: { campaignId: campana.id, storeId, date: { gte: inicio, lte: fin } } }),
    prisma.user.findMany({ where: { storeId, ...PERSON_WHERE }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);
  return resumirSemana({
    inicio,
    metas: metas.map((m) => ({ fecha: claveFecha(m.date), meta: Number(m.amount) })),
    aportes: aportes.map((a) => ({ userId: a.userId, fecha: claveFecha(a.date), monto: Number(a.amount), donativos: a.count })),
    personas: personas.map((p) => ({ userId: p.id, nombre: p.name }))
  });
}

/** Lo acumulado desde que arrancó la campaña: tienda y persona. */
export async function acumuladoCampana(storeId: string, userId?: string) {
  const campana = await campanaActual();
  if (!campana) return null;
  const [tienda, metas, propio] = await Promise.all([
    prisma.campaignEntry.aggregate({ where: { campaignId: campana.id, storeId }, _sum: { amount: true, count: true } }),
    prisma.campaignGoal.aggregate({ where: { campaignId: campana.id, storeId }, _sum: { amount: true } }),
    userId
      ? prisma.campaignEntry.aggregate({ where: { campaignId: campana.id, storeId, userId }, _sum: { amount: true, count: true } })
      : Promise.resolve(null)
  ]);
  return {
    tienda: Number(tienda._sum.amount ?? 0),
    donativosTienda: tienda._sum.count ?? 0,
    metaCargada: Number(metas._sum.amount ?? 0),
    propio: propio ? Number(propio._sum.amount ?? 0) : null,
    donativosPropios: propio?._sum.count ?? null
  };
}

export type CapturaCampana = {
  metas?: Array<{ fecha: string; meta: number }>;
  aportes?: Array<{ userId: string; fecha: string; monto: number | null; donativos?: number }>;
};

/**
 * Guarda la semana que captura gerencia. Un monto vacío BORRA la fila: así se
 * corrige un aporte puesto en la persona equivocada sin dejar un $0 que diga
 * «capturado y no juntó nada».
 */
export async function guardarSemana(storeId: string, fecha: Date, captura: CapturaCampana, actor: string) {
  const campana = await campanaActual();
  if (!campana) throw new Error("La campaña no existe.");
  const fechas = new Set(fechasDeSemana(domingoDeSemana(fecha)));
  const fuera = [...(captura.metas ?? []), ...(captura.aportes ?? [])].find((x) => !fechas.has(x.fecha));
  if (fuera) throw new Error(`El día ${fuera.fecha} no es de esta semana.`);

  const personas = new Set(
    (await prisma.user.findMany({ where: { storeId, ...PERSON_WHERE }, select: { id: true } })).map((u) => u.id)
  );
  const ajeno = (captura.aportes ?? []).find((a) => !personas.has(a.userId));
  if (ajeno) throw new Error("Hay un aporte de alguien que no es de esta tienda.");

  await prisma.$transaction([
    ...(captura.metas ?? []).map((m) =>
      prisma.campaignGoal.upsert({
        where: { campaignId_storeId_date: { campaignId: campana.id, storeId, date: new Date(`${m.fecha}T00:00:00Z`) } },
        create: { campaignId: campana.id, storeId, date: new Date(`${m.fecha}T00:00:00Z`), amount: m.meta, updatedBy: actor },
        update: { amount: m.meta, updatedBy: actor }
      })
    ),
    ...(captura.aportes ?? []).map((a) => {
      const date = new Date(`${a.fecha}T00:00:00Z`);
      const where = { campaignId_userId_date: { campaignId: campana.id, userId: a.userId, date } };
      if (a.monto === null) return prisma.campaignEntry.deleteMany({ where: { campaignId: campana.id, userId: a.userId, date } });
      return prisma.campaignEntry.upsert({
        where,
        create: { campaignId: campana.id, storeId, userId: a.userId, date, amount: a.monto, count: a.donativos ?? 0, updatedBy: actor },
        // Sin número de donativos se conserva el que había: la pantalla no lo
        // prellena, y guardar el monto no puede borrarlo.
        update: { amount: a.monto, ...(a.donativos !== undefined ? { count: a.donativos } : {}), updatedBy: actor }
      });
    })
  ]);
}

/**
 * Para el calendario de Retool: metas, aportes y personas de un rango de días.
 * Sin resumir: el calendario agrupa por día y por persona por su cuenta.
 */
export async function datosDeRango(storeId: string, desde: Date, hasta: Date) {
  const campana = await campanaActual();
  if (!campana) return null;
  const rango = { gte: desde, lte: hasta };
  const [metas, aportes, personas] = await Promise.all([
    prisma.campaignGoal.findMany({ where: { campaignId: campana.id, storeId, date: rango }, orderBy: { date: "asc" } }),
    prisma.campaignEntry.findMany({ where: { campaignId: campana.id, storeId, date: rango }, orderBy: { date: "asc" } }),
    prisma.user.findMany({ where: { storeId, ...PERSON_WHERE }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } })
  ]);
  return {
    campana: { nombre: campana.name, inicio: claveFecha(campana.startDate), activa: campana.active },
    metas: metas.map((m) => ({ fecha: claveFecha(m.date), meta: Number(m.amount) })),
    aportes: aportes.map((a) => ({ userId: a.userId, fecha: claveFecha(a.date), monto: Number(a.amount), donativos: a.count })),
    personas: personas.map((p) => ({ userId: p.id, nombre: p.name, rol: p.role }))
  };
}
