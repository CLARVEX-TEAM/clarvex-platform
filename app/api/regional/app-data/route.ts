import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dashboardDateKey, dashboardDateRange } from "@/lib/dashboard-kpi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession(["REGIONAL"]);
  if (isApiError(session)) return session;

  const dashboardDate = dashboardDateKey();
  const dashboardRange = dashboardDateRange(dashboardDate);

  try {
    // 1. Obtener todas las tiendas
    const stores = await prisma.store.findMany({
      orderBy: { name: "asc" }
    });

    // 2. Obtener ventas y metas del día agrupadas por tienda
    const dailyKpis = await prisma.kpi.findMany({
      where: {
        date: { gte: dashboardRange.start, lt: dashboardRange.end }
      },
      select: {
        storeId: true,
        dailySales: true,
        dailyGoal: true,
        transactions: true,
        pieces: true
      }
    });

    // 3. Obtener ventas y metas del mes (acumuladas) agrupadas por tienda
    // Para simplificar, tomamos los registros del mes actual de la base de datos
    const firstDayOfMonth = new Date(dashboardRange.start);
    firstDayOfMonth.setDate(1);

    const monthlyKpis = await prisma.kpi.findMany({
      where: {
        date: { gte: firstDayOfMonth, lt: dashboardRange.end }
      },
      select: {
        storeId: true,
        dailySales: true,
        dailyGoal: true
      }
    });

    // 4. Obtener cantidad de asesores activos por tienda
    const activeUsers = await prisma.user.findMany({
      where: { active: true, role: "ASESOR" },
      select: { storeId: true }
    });

    // Calcular estadísticas por tienda
    const storeStats = stores.map(store => {
      const storeDaily = dailyKpis.filter(k => k.storeId === store.id);
      const storeMonthly = monthlyKpis.filter(k => k.storeId === store.id);
      
      const salesToday = storeDaily.reduce((sum, k) => sum + Number(k.dailySales), 0);
      const goalToday = storeDaily.reduce((sum, k) => sum + Number(k.dailyGoal), 0);
      const salesMonth = storeMonthly.reduce((sum, k) => sum + Number(k.dailySales), 0);
      const goalMonth = storeMonthly.reduce((sum, k) => sum + Number(k.dailyGoal), 0);
      
      const advisorsCount = activeUsers.filter(u => u.storeId === store.id).length;

      return {
        id: store.id,
        name: store.name,
        salesToday,
        goalToday,
        salesMonth,
        goalMonth,
        advisorsCount
      };
    });

    // 5. Ranking global de los mejores asesores del mes (Top 10)
    // Agrupamos la venta mensual acumulada por usuario en el rango del mes
    const topAdvisorsRaw = await prisma.kpi.findMany({
      where: {
        date: { gte: firstDayOfMonth, lt: dashboardRange.end },
        user: { role: "ASESOR", active: true }
      },
      include: {
        user: {
          select: { name: true, photoUrl: true, store: { select: { name: true } } }
        }
      },
      orderBy: { dailySales: "desc" }
    });

    // Agrupar ventas acumuladas por usuario para evitar duplicaciones si hay registros diarios
    const advisorSalesMap: Record<string, { name: string; photoUrl: string | null; storeName: string; sales: number }> = {};
    for (const record of topAdvisorsRaw) {
      const uId = record.userId;
      if (!advisorSalesMap[uId]) {
        advisorSalesMap[uId] = {
          name: record.user.name,
          photoUrl: record.user.photoUrl,
          storeName: record.user.store.name,
          sales: 0
        };
      }
      advisorSalesMap[uId].sales += Number(record.dailySales);
    }

    const topAdvisors = Object.values(advisorSalesMap)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    return NextResponse.json({
      date: dashboardDate,
      stores: storeStats,
      topAdvisors
    });
  } catch (error: any) {
    console.error("[Regional API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al recopilar datos regionales." },
      { status: 500 }
    );
  }
}
