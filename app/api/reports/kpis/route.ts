import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { aggregateKpis, aggregateStore, type KpiReportItem } from "@/lib/kpi-report";
import { prisma } from "@/lib/prisma";

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

  const rows = await prisma.kpi.findMany({
    where: { storeId: session.storeId, date: { gte: start, lte: end } },
    include: { user: { select: { name: true, role: true, photoUrl: true } } },
    orderBy: [{ date: "asc" }, { userId: "asc" }]
  });

  const reports = aggregateKpis(rows, periodLabel === "Mensual");
  const store = aggregateStore(reports);
  const ordered = [...reports].sort((a, b) => b.sales - a.sales);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Clarvex Team";
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
