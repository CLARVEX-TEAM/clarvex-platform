import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { decodeSyncLogMessage, type KpiSyncMetrics } from "@/lib/data-source";
import { aggregateKpis, aggregateStore, aggregateStoreTraffic, type KpiReportItem } from "@/lib/kpi-report";
import { prisma } from "@/lib/prisma";
import { buildWeeklyCloseColumn, buildWeeklyCloseColumns, distributeWhatsappBudget } from "@/lib/weekly-close";
import { buildWeeklyCloseSheet } from "@/lib/weekly-close-excel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string | null): Date | null {
  if (!value || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MONEY_FMT = '"$"#,##0';
const COLUMNS: Array<{ header: string; width: number; fmt?: string; value: (item: KpiReportItem) => number | string | null }> = [
  { header: "Colaborador", width: 26, value: (item) => item.userName },
  { header: "Rol", width: 12, value: (item) => item.role },
  { header: "Venta", width: 14, fmt: MONEY_FMT, value: (item) => item.sales },
  { header: "Meta", width: 14, fmt: MONEY_FMT, value: (item) => item.goal },
  { header: "Cumplimiento %", width: 16, value: (item) => Math.round(item.achievement) },
  { header: "Tickets", width: 10, value: (item) => item.transactions },
  { header: "Piezas", width: 10, value: (item) => item.pieces },
  { header: "UPT", width: 8, value: (item) => item.upt },
  { header: "AUR", width: 12, fmt: MONEY_FMT, value: (item) => item.aur },
  { header: "EPT", width: 12, fmt: MONEY_FMT, value: (item) => item.ept },
  { header: "Conversión %", width: 14, value: (item) => item.conversion },
  { header: "Comisión", width: 14, fmt: MONEY_FMT, value: (item) => item.commissionAmount },
  { header: "Comisión %", width: 12, value: (item) => item.commissionPercent }
];

export async function GET(request: Request) {
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const params = new URL(request.url).searchParams;
  const start = parseDate(params.get("start"));
  const end = parseDate(params.get("end"));
  if (!start || !end || start > end) {
    return NextResponse.json({ error: "Rango de fechas inválido (usa start y end en formato YYYY-MM-DD)." }, { status: 400 });
  }
  const periodLabel = params.get("period") === "month" ? "Mensual" : "Semanal";
  const rangeLabel = params.get("label")?.slice(0, 80) ?? "";
  const weekParam = params.get("week");
  const weekNumber = weekParam && /^\d{1,3}$/.test(weekParam) ? Number(weekParam) : null;

  const [rows, storeRecord, whatsappTarget] = await Promise.all([
    prisma.kpi.findMany({
      where: { storeId: session.storeId, date: { gte: start, lte: end } },
      include: { user: { select: { name: true, role: true, photoUrl: true } } },
      orderBy: [{ date: "asc" }, { userId: "asc" }]
    }),
    prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } }),
    // PPTO semanal de WhatsApp capturado por gerencia en Metas internas
    prisma.kpiTarget.findUnique({ where: { storeId_metric_period: { storeId: session.storeId, metric: "whatsapp", period: "SEMANA" } } })
  ]);
  const whatsappBudget = whatsappTarget ? Number(whatsappTarget.value) : null;

  const reports = aggregateKpis(rows, periodLabel === "Mensual");
  const store = aggregateStore(reports, aggregateStoreTraffic(rows));
  const ordered = [...reports].sort((a, b) => b.sales - a.sales);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Clarvex Team";

  // Cierre semanal: formato "RESUMEN DE DESEMPEÑO SEMANAL (ASESORES)"
  if (periodLabel === "Semanal" && store) {
    // Todo el equipo activo aparece en el reporte, aunque no tenga datos esa
    // semana (vacaciones, incapacidad): columna en ceros como el formato.
    const [teamUsers, latestKpiSource] = await Promise.all([
      prisma.user.findMany({
        where: { storeId: session.storeId, active: true, role: { in: ["GERENTE", "SUBGERENTE", "ASESOR"] } },
        select: { id: true, name: true, role: true, photoUrl: true, employeeNumber: true, employeeNumberAliases: { select: { employeeNumber: true } } }
      }),
      prisma.dataSource.findFirst({
        where: { storeId: session.storeId, type: "KPIS" },
        include: { syncLogs: { where: { status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 1 } }
      })
    ]);
    // Columnas en el orden del RDV (gerente, subgerentes, vendedor 1, 2…):
    // el último sync guarda los números de empleado en ese orden.
    const syncDetails = latestKpiSource?.syncLogs[0] ? decodeSyncLogMessage(latestKpiSource.syncLogs[0].message).details : null;
    const employeeOrder = (syncDetails as Partial<KpiSyncMetrics> | null)?.employeeOrder;
    let rdvOrder: Map<string, number> | null = null;
    if (Array.isArray(employeeOrder) && employeeOrder.length > 0) {
      rdvOrder = new Map();
      for (const user of teamUsers) {
        const numbers = [user.employeeNumber, ...user.employeeNumberAliases.map((alias) => alias.employeeNumber)];
        const index = numbers.map((num) => employeeOrder.indexOf(num)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
        if (index !== undefined) rdvOrder.set(user.id, index);
      }
    }
    const withData = new Set(reports.map((report) => report.userId));
    const fullReports: KpiReportItem[] = [
      ...reports,
      ...teamUsers.filter((user) => !withData.has(user.id)).map((user): KpiReportItem => ({
        userId: user.id, userName: user.name, role: user.role as KpiReportItem["role"],
        avatar: user.name.slice(0, 2).toUpperCase(), photoUrl: user.photoUrl,
        sales: 0, goal: 0, achievement: 0, transactions: 0, pieces: 0,
        upt: null, aur: null, ept: null, conversion: null, traffic: null, ranking: 0,
        grossSales: null, orkestraSales: null, orkestraTransactions: null, orkestraPieces: null,
        discountAmount: null, discountMargin: null, discountLimit: null,
        commissionAmount: 0, commissionPercent: 0, commissionMinimum: null
      }))
    ];
    // Meta WhatsApp repartida por días laborados (horarios sincronizados)
    let waMetaByUser: Map<string, number> | null = null;
    if (whatsappBudget && whatsappBudget > 0) {
      const schedules = await prisma.schedule.findMany({
        where: { storeId: session.storeId, date: { gte: start, lte: end } },
        select: { userId: true, date: true, status: true, statusRaw: true }
      });
      // Mejor registro por usuario y día (mismo criterio de calidad que /api/kpis)
      const best = new Map<string, { status: string; quality: number }>();
      for (const schedule of schedules) {
        const key = `${schedule.userId}:${schedule.date.toISOString().slice(0, 10)}`;
        const quality = (schedule.statusRaw ? 2 : 0) + (schedule.date.getUTCHours() === 0 ? 1 : 0);
        if (!best.has(key) || quality > best.get(key)!.quality) best.set(key, { status: schedule.status, quality });
      }
      const presenceByDay = new Map<string, Set<string>>();
      for (const entry of Array.from(best.entries())) {
        if (entry[1].status !== "WORKING") continue;
        const [userId, dateKey] = [entry[0].slice(0, entry[0].indexOf(":")), entry[0].slice(entry[0].indexOf(":") + 1)];
        if (!presenceByDay.has(dateKey)) presenceByDay.set(dateKey, new Set());
        presenceByDay.get(dateKey)!.add(userId);
      }
      const roles = new Map(fullReports.map((report) => [report.userId, report.role]));
      const distributed = distributeWhatsappBudget(whatsappBudget, presenceByDay, roles);
      if (distributed.size > 0) waMetaByUser = distributed;
    }
    buildWeeklyCloseSheet(workbook, {
      storeName: storeRecord?.name ?? "Tienda",
      weekNumber,
      rangeLabel,
      columns: buildWeeklyCloseColumns(fullReports, store, whatsappBudget, waMetaByUser, rdvOrder),
      store: buildWeeklyCloseColumn(store, store, whatsappBudget)
    });
    const weeklyBuffer = await workbook.xlsx.writeBuffer();
    const weeklyName = `cierre-semana${weekNumber ? `-${weekNumber}` : ""}-${params.get("start")}.xlsx`;
    return new NextResponse(weeklyBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${weeklyName}"`,
        "Cache-Control": "no-store"
      }
    });
  }

  const sheet = workbook.addWorksheet("Reporte KPIs");

  const title = sheet.addRow(["Clarvex Team — Reporte de KPIs"]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([`Periodo: ${periodLabel}${rangeLabel ? ` · ${rangeLabel}` : ""}`]);
  sheet.addRow([`Rango: ${params.get("start")} a ${params.get("end")}`]);
  sheet.addRow([`Generado: ${new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(COLUMNS.map((column) => column.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } }; });

  const writeRow = (item: KpiReportItem, bold = false) => {
    const row = sheet.addRow(COLUMNS.map((column) => column.value(item) ?? "—"));
    if (bold) row.font = { bold: true };
    COLUMNS.forEach((column, index) => {
      if (column.fmt) row.getCell(index + 1).numFmt = column.fmt;
    });
  };

  if (store) writeRow(store, true);
  for (const item of ordered) writeRow(item);

  COLUMNS.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `reporte-kpis-${params.get("start")}_${params.get("end")}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
