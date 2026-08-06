import { buildUserDashboardKpi, dashboardDateKey, dashboardDateRange, type DashboardKpiRow } from "@/lib/dashboard-kpi";
import { decodeSyncLogMessage, type KpiSyncMetrics } from "@/lib/data-source";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic } from "@/lib/kpi-report";
import { buildRetailMonths, periodDateKey, selectRetailMonth, selectRdvWeek, type KpiPeriod } from "@/lib/kpi-period";
import { prisma } from "@/lib/prisma";
import { mergeRdvWeeks } from "@/lib/rdv-week";
import type { Session } from "@/lib/session-token";
import { buildWorkingScheduleKeys } from "@/lib/working-days";

// Servicio único de reporte de KPIs por período (semana/mes retail). Extraído
// de app/api/kpis/route.ts para que la ruta HTTP y el Copilot compartan
// EXACTAMENTE la misma lógica y devuelvan los mismos números.

export type KpiReportParams = {
  period: KpiPeriod;
  selectedDate: Date;
  /** Corta el fin del periodo (p.ej. "hasta ayer" sin incluir el día en curso). */
  asOfDate?: Date;
  /** Reporte de un solo día (selectedDate), con la misma lógica de horarios/agregación que KPIs. */
  dayOnly?: boolean;
};

export async function getKpiReport(session: Session, { period, selectedDate, asOfDate, dayOnly = false }: KpiReportParams) {
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const userFilter = manager ? {} : { userId: session.userId };
  const [availableWeekRows, legacyWeekRows, latestKpiSource, discountSource] = await Promise.all([
    prisma.kpi.findMany({
      where: { storeId: session.storeId, ...userFilter, weekNumber: { not: null }, weekStart: { not: null }, weekEnd: { not: null } },
      distinct: ["weekStart", "weekNumber"],
      select: { weekNumber: true, weekStart: true, weekEnd: true },
      orderBy: { weekStart: "desc" }
    }),
    prisma.kpi.findMany({
      where: { storeId: session.storeId, ...userFilter, OR: [{ weekNumber: null }, { weekStart: null }, { weekEnd: null }] },
      distinct: ["date"],
      select: { date: true },
      orderBy: { date: "desc" }
    }),
    prisma.dataSource.findFirst({
      where: { storeId: session.storeId, type: "KPIS" },
      // Se conservan varios logs: los TTLS (meta/tráfico/mínimo de tienda) se
      // toman del último sync DEL MES CONSULTADO, no del último sync global —
      // al vincular el RDV de julio, junio seguía leyendo los TTLS de julio.
      include: { syncLogs: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 60 } }
    }),
    prisma.dataSource.findFirst({ where: { storeId: session.storeId, type: "DESCUENTOS_POS" } })
  ]);
  const hasDiscountSource = discountSource !== null;
  const persistedWeeks = availableWeekRows.flatMap((week) => week.weekNumber !== null && week.weekStart && week.weekEnd ? [{ weekNumber: week.weekNumber, weekStart: week.weekStart, weekEnd: week.weekEnd }] : []);
  const latestDetails = latestKpiSource?.syncLogs[0] ? decodeSyncLogMessage(latestKpiSource.syncLogs[0].message).details : null;
  const syncedWeeks = isKpiSyncMetrics(latestDetails) ? latestDetails.weeksDetected.map((week) => ({
    weekNumber: week.weekNumber,
    weekStart: new Date(`${week.weekStart}T00:00:00.000Z`),
    weekEnd: new Date(`${week.weekEnd}T00:00:00.000Z`)
  })) : [];
  const availableWeeks = mergeRdvWeeks([...persistedWeeks, ...syncedWeeks], legacyWeekRows.map((row) => row.date))
    .sort((left, right) => left.weekStart.getTime() - right.weekStart.getTime());
  const selectedWeek = period === "week" ? selectRdvWeek(availableWeeks, selectedDate) : null;
  const retailMonths = buildRetailMonths(availableWeeks);
  const selectedRetailMonth = selectRetailMonth(retailMonths, selectedDate);
  let start = selectedWeek?.weekStart ?? selectedRetailMonth?.start ?? selectedDate;
  let end = selectedWeek?.weekEnd ?? selectedRetailMonth?.end ?? selectedDate;
  if (dayOnly) {
    const day = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()));
    start = day;
    end = day;
  } else if (asOfDate && asOfDate.getTime() < end.getTime()) {
    end = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate()));
  }

  const [allRows, rules, latestDiscountAnchor, commissionStore] = await Promise.all([
    prisma.kpi.findMany({
      where: {
        storeId: session.storeId,
        ...(period === "week" && !selectedWeek
          ? { id: "__missing_rdv_week__" }
          : { date: { gte: start, lte: end } })
      },
      include: { user: { select: { name: true, role: true, photoUrl: true } } },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    }),
    prisma.commissionRule.findMany({
      where: { storeId: session.storeId, ...(manager ? {} : { OR: [{ role: session.role }, { role: null }] }) },
      orderBy: [{ active: "desc" }, { role: "asc" }, { minAchievement: "asc" }]
    }),
    prisma.kpi.findFirst({
      where: { storeId: session.storeId, ...(!manager ? { userId: session.userId } : {}), discountAmount: { not: null }, weekNumber: { not: null } },
      orderBy: { date: "desc" },
      select: { weekNumber: true }
    }),
    // La BASE de comisión viaja con las reglas: sin ella el cliente no sabe si
    // el alcance se mide contra el mínimo o contra la meta, y en GUESS ese
    // denominador cambia el bracket —y el pago— por completo.
    prisma.store.findUnique({ where: { id: session.storeId }, select: { commissionBasis: true } })
  ]);
  const rows = manager ? allRows : allRows.filter((row) => row.userId === session.userId);

  // Horarios de TODO el equipo: los días laborados definen el tráfico (y la
  // conversión) de cada colaborador, gerencia incluida.
  const teamUserIds = Array.from(new Set(allRows.map((row) => row.userId)));
  const schedules = teamUserIds.length ? await prisma.schedule.findMany({
    where: { storeId: session.storeId, userId: { in: teamUserIds }, date: { gte: start, lte: end } },
    select: { userId: true, date: true, status: true, statusRaw: true }
  }) : [];
  const workingKeys = buildWorkingScheduleKeys(schedules);
  const useMonthlyGoal = period === "month";
  const storeReports = aggregateKpis(rows, useMonthlyGoal, workingKeys);
  const allReports = manager ? storeReports : aggregateKpis(allRows, useMonthlyGoal, workingKeys);
  const team = allReports
    .filter((item) => item.role === "ASESOR")
    .sort((a, b) => b.sales - a.sales || b.achievement - a.achievement);
  team.forEach((item, index) => { item.ranking = index + 1; });
  const own = allReports.find((item) => item.userId === session.userId) ?? null;
  // TTLS del mes retail consultado: junio (cerrado) usa su ÚLTIMO sync de
  // junio, aunque el sync más reciente ya sea del RDV de julio.
  const referenceMonth = selectRetailMonth(retailMonths, start);
  const kpiTtls = pickTtlsForMonth(latestKpiSource?.syncLogs ?? [], referenceMonth?.label ?? null);
  const ttlsGoalOverride = period === "month" && kpiTtls?.ttlsMeta && kpiTtls.ttlsMeta > 0 ? kpiTtls.ttlsMeta : undefined;
  const ttlsTxOverride = period === "month" && kpiTtls?.ttlsTransactions && kpiTtls.ttlsTransactions > 0 ? kpiTtls.ttlsTransactions : undefined;
  const ttlsPiecesOverride = period === "month" && kpiTtls?.ttlsPieces && kpiTtls.ttlsPieces > 0 ? kpiTtls.ttlsPieces : undefined;
  // El mínimo de tienda (TOTALES de COMISIONES) es mensual; debe estar disponible en
  // todos los períodos para que el alcance de comisión se mida SIEMPRE contra mínimo.
  const ttlsCommissionMinimum = kpiTtls?.ttlsCommissionMinimum && kpiTtls.ttlsCommissionMinimum > 0 ? kpiTtls.ttlsCommissionMinimum : null;
  const computedTraffic = aggregateStoreTraffic(rows);
  const trafficForStore = computedTraffic ?? (period === "month" ? (kpiTtls?.ttlsTraffic ?? null) : null);
  const store = manager ? aggregateStore(storeReports, trafficForStore, ttlsGoalOverride, ttlsTxOverride, ttlsPiecesOverride, ttlsCommissionMinimum) : null;
  const workedDays = session.role === "ASESOR"
    ? Array.from(workingKeys).filter((key) => key.startsWith(`${session.userId}:`)).length
    : null;

  const currentDiscountMargin = manager ? store?.discountMargin : own?.discountMargin;
  const latestDiscountWeekNum = latestDiscountAnchor?.weekNumber ?? null;
  let latestDiscountWeek: { weekNumber: number; margin: number | null } | null = null;
  if (latestDiscountWeekNum !== null && currentDiscountMargin === null) {
    const weekRows = await prisma.kpi.findMany({
      where: { storeId: session.storeId, ...(!manager ? { userId: session.userId } : {}), weekNumber: latestDiscountWeekNum, discountAmount: { not: null } },
      select: { grossSales: true, discountAmount: true }
    });
    const totalGross = weekRows.reduce((t, r) => t + (r.grossSales ? Number(r.grossSales) : 0), 0);
    const totalDiscount = weekRows.reduce((t, r) => t + (r.discountAmount ? Number(r.discountAmount) : 0), 0);
    latestDiscountWeek = { weekNumber: latestDiscountWeekNum, margin: totalGross > 0 ? Math.round((totalDiscount / totalGross) * 10_000) / 100 : null };
  }

  return {
    period,
    selectedDate: periodDateKey(selectedDate),
    startDate: periodDateKey(start),
    endDate: periodDateKey(end),
    weekNumber: selectedWeek?.weekNumber ?? null,
    availableWeeks: availableWeeks.map((week) => ({ weekNumber: week.weekNumber, weekStart: periodDateKey(week.weekStart), weekEnd: periodDateKey(week.weekEnd) })),
    availableRetailMonths: retailMonths.map((month) => ({ label: month.label, start: periodDateKey(month.start), end: periodDateKey(month.end) })),
    retailMonthLabel: selectedRetailMonth?.label ?? null,
    workedDays,
    currentUserId: session.userId,
    role: session.role,
    store,
    own,
    team: manager
      ? team
      : team.map((item) => item.userId === session.userId
        ? item
        : { ...item, sales: 0, goal: 0, transactions: 0, pieces: 0, upt: null, aur: null, ept: null, grossSales: null, orkestraSales: null, orkestraTransactions: null, orkestraPieces: null, discountAmount: null, discountMargin: null, discountLimit: null, commissionAmount: 0, commissionPercent: 0 }
      ),
    hasDiscountSource,
    latestDiscountWeek,
    commissionBasis: commissionStore?.commissionBasis ?? "MINIMO",
    commissionRules: rules.map((rule) => ({
      id: rule.id, storeId: rule.storeId, role: rule.role,
      minSales: Number(rule.minSales), maxSales: rule.maxSales === null ? null : Number(rule.maxSales),
      minAchievement: Number(rule.minAchievement), maxAchievement: rule.maxAchievement === null ? null : Number(rule.maxAchievement),
      commissionPercent: Number(rule.commissionPercent), active: rule.active,
      // Sin estos tres, un bracket de importe fijo llega al navegador como un
      // porcentaje de 0 y `rulePayout` paga cero a quien sí cumplió.
      payoutType: rule.payoutType,
      fixedAmount: rule.fixedAmount === null ? null : Number(rule.fixedAmount),
      fixedAmountHigh: rule.fixedAmountHigh === null ? null : Number(rule.fixedAmountHigh)
    }))
  };
}

export type KpiReport = Awaited<ReturnType<typeof getKpiReport>>;

/** Hechos numéricos listos para IA/UI — salen de getKpiReport, sin recalcular. */
export function kpiFactsFromReport(report: KpiReport) {
  const store = report.store;
  return {
    period: report.period,
    startDate: report.startDate,
    endDate: report.endDate,
    weekNumber: report.weekNumber,
    retailMonthLabel: report.retailMonthLabel,
    store: store
      ? {
          sales: store.sales,
          goal: store.goal,
          achievement: store.achievement,
          transactions: store.transactions,
          pieces: store.pieces,
          traffic: store.traffic,
          upt: store.upt,
          aur: store.aur,
          ept: store.ept,
          conversion: store.conversion
        }
      : null,
    team: report.team.map((item) => ({
      userId: item.userId,
      name: item.userName,
      role: item.role,
      sales: item.sales,
      goal: item.goal,
      achievement: item.achievement,
      transactions: item.transactions,
      pieces: item.pieces,
      traffic: item.traffic,
      upt: item.upt,
      aur: item.aur,
      ept: item.ept,
      conversion: item.conversion,
      ranking: item.ranking
    }))
  };
}

export type KpiFacts = ReturnType<typeof kpiFactsFromReport>;

// Resultados del DÍA (hoy por defecto) para la tienda (gerencia) o el propio
// asesor. Reutiliza el constructor del dashboard para calcular la conversión.
export async function getStoreDailyResults(session: Session, dateKeyStr?: string) {
  const manager = session.role === "GERENTE" || session.role === "SUBGERENTE";
  const key = dateKeyStr ?? dashboardDateKey(new Date(), "America/Monterrey");
  const { start, end } = dashboardDateRange(key);
  const rows = await prisma.kpi.findMany({
    where: { storeId: session.storeId, ...(manager ? {} : { userId: session.userId }), date: { gte: start, lt: end } },
    select: { dailyGoal: true, dailySales: true, transactions: true, pieces: true, traffic: true }
  });

  const totals = rows.reduce(
    (acc, row) => ({
      dailyGoal: acc.dailyGoal + Number(row.dailyGoal),
      dailySales: acc.dailySales + Number(row.dailySales),
      transactions: acc.transactions + row.transactions,
      pieces: acc.pieces + row.pieces,
      // El tráfico es a nivel tienda; se toma el máximo del día, no la suma.
      traffic: Math.max(acc.traffic, row.traffic ?? 0)
    }),
    { dailyGoal: 0, dailySales: 0, transactions: 0, pieces: 0, traffic: 0 }
  );

  const daily = buildUserDashboardKpi(key, rows.length ? { ...totals, traffic: totals.traffic > 0 ? totals.traffic : null } : null);
  return {
    date: daily.date,
    scope: manager ? "store" : "own",
    sales: daily.dailySales,
    goal: daily.dailyGoal,
    achievement: daily.dailyGoal > 0 ? Math.round((daily.dailySales / daily.dailyGoal) * 1000) / 10 : 0,
    transactions: daily.transactions,
    pieces: daily.pieces,
    traffic: daily.traffic,
    conversion: daily.conversion
  };
}

function isKpiSyncMetrics(details: unknown): details is KpiSyncMetrics {
  return typeof details === "object" && details !== null && "sheetUsed" in details && "weeksDetected" in details && Array.isArray((details as KpiSyncMetrics).weeksDetected);
}

// El último sync cuyo RDV corresponde al mes retail consultado. Sin mes de
// referencia (o si ningún log coincide, p. ej. meses previos al historial)
// no hay TTLS y la tienda cae a la suma de metas por colaborador.
function pickTtlsForMonth(logs: Array<{ message: string }>, monthLabel: string | null): KpiSyncMetrics | null {
  for (const log of logs) {
    const details = decodeSyncLogMessage(log.message).details;
    if (!isKpiSyncMetrics(details) || !("ttlsMeta" in details)) continue;
    if (!monthLabel || details.retailMonthLabel === monthLabel) return details as KpiSyncMetrics;
  }
  return null;
}
