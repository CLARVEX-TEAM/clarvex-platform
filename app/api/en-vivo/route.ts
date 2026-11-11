import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { ventaPorDia } from "@/lib/kpi-dias";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * El panel «Venta en vivo» (`/escritorio/en-vivo`): la venta de HOY de la
 * tienda y de cada quien, y el acumulado de la semana retail.
 *
 * Solo gerencia: enseña la venta de todo el equipo. Se pide cada 30 segundos,
 * así que es UNA consulta acotada a la semana.
 */
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const hoy = resolveMonterreyDate();
  // La semana retail empieza en domingo.
  const domingo = new Date(hoy.utcDate.getTime() - hoy.weekday * 86_400_000);
  const inicio = domingo.toISOString().slice(0, 10);

  const tienda = await prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } });
  const filas = await prisma.kpi.findMany({
    where: { storeId: session.storeId, date: { gte: domingo, lte: hoy.utcDate }, user: { checklistOnly: false } },
    select: {
      date: true, userId: true, dailySales: true, dailyGoal: true, transactions: true, pieces: true, traffic: true, updatedAt: true,
      user: { select: { name: true, role: true, photoUrl: true } }
    }
  });

  const dias = ventaPorDia(
    filas.map((f) => ({
      date: f.date, userId: f.userId, name: f.user.name, role: f.user.role, photoUrl: f.user.photoUrl,
      dailySales: Number(f.dailySales), dailyGoal: Number(f.dailyGoal), transactions: f.transactions, pieces: f.pieces, traffic: f.traffic
    })),
    { inicio, fin: hoy.dateKey, hoy: hoy.dateKey, soloUserId: null }
  );
  const deHoy = dias.find((d) => d.fecha === hoy.dateKey) ?? null;
  const capturados = dias.filter((d) => d.capturado);
  const semana = {
    inicio,
    venta: capturados.reduce((t, d) => t + d.venta, 0),
    // La meta de la semana HASTA HOY, no la de la semana entera: el martes no se juzga contra el sábado.
    meta: dias.reduce((t, d) => t + d.meta, 0),
    dias: dias.slice().reverse().map((d) => ({ fecha: d.fecha, venta: d.venta, meta: d.meta, capturado: d.capturado }))
  };
  const actualizado = filas
    .filter((f) => f.date.getTime() === hoy.utcDate.getTime())
    .reduce<Date | null>((max, f) => (!max || f.updatedAt > max ? f.updatedAt : max), null);

  return NextResponse.json(
    { fecha: hoy.dateKey, tienda: tienda?.name ?? null, hoy: deHoy, semana, actualizado: actualizado?.toISOString() ?? null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
