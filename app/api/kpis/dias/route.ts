import { NextRequest, NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { resolveMonterreyDate } from "@/lib/cron-time";
import { ventaPorDia } from "@/lib/kpi-dias";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Un mes retail trae hasta 35 días; con margen. */
const MAX_DIAS = 45;

/**
 * Venta día por día del periodo que se está viendo en KPIs.
 *
 * ⚠️ El asesor recibe SOLO sus filas: se filtra en la consulta, no en la
 * pantalla. Gerencia recibe la tienda y el detalle de cada quien.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const inicio = request.nextUrl.searchParams.get("start") ?? "";
  const fin = request.nextUrl.searchParams.get("end") ?? "";
  if (!FECHA.test(inicio) || !FECHA.test(fin) || inicio > fin) {
    return NextResponse.json({ error: "start y end deben ser AAAA-MM-DD, con start antes que end." }, { status: 400 });
  }
  const desde = new Date(`${inicio}T00:00:00.000Z`);
  const hasta = new Date(`${fin}T00:00:00.000Z`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || (hasta.getTime() - desde.getTime()) / 86_400_000 > MAX_DIAS) {
    return NextResponse.json({ error: `El rango no puede pasar de ${MAX_DIAS} días.` }, { status: 400 });
  }

  const gerencia = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const filas = await prisma.kpi.findMany({
    where: {
      storeId: session.storeId,
      date: { gte: desde, lte: hasta },
      ...(gerencia ? {} : { userId: session.userId }),
      // El aparato de la tienda no vende. Las bajas SÍ cuentan: lo que vendieron sigue siendo venta.
      user: { checklistOnly: false }
    },
    select: {
      date: true, userId: true, dailySales: true, dailyGoal: true, transactions: true, pieces: true, traffic: true,
      user: { select: { name: true, role: true, photoUrl: true } }
    }
  });

  const dias = ventaPorDia(
    filas.map((f) => ({
      date: f.date,
      userId: f.userId,
      name: f.user.name,
      role: f.user.role,
      photoUrl: f.user.photoUrl,
      dailySales: Number(f.dailySales),
      dailyGoal: Number(f.dailyGoal),
      transactions: f.transactions,
      pieces: f.pieces,
      traffic: f.traffic
    })),
    { inicio, fin, hoy: resolveMonterreyDate().dateKey, soloUserId: gerencia ? null : session.userId }
  );
  return NextResponse.json({ dias, gerencia }, { headers: { "Cache-Control": "private, no-store" } });
}
