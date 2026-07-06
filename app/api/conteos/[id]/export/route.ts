import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSession, isApiError } from "@/lib/api";
import { entryDifference, entryReal, type CycleZone } from "@/lib/cycle-count";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const DIFF_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };

// GET — Mesa de Control del conteo en Excel (Resumen + Piso + Bodega + Sin UPC).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const [count, tags, store] = await Promise.all([
    prisma.cycleCount.findFirst({
      where: { id, storeId: session.storeId },
      include: { entries: true, noUpcItems: { orderBy: { concept: "asc" } } }
    }),
    prisma.cycleCountTag.findMany({ where: { storeId: session.storeId, active: true }, orderBy: { number: "asc" } }),
    prisma.store.findUnique({ where: { id: session.storeId }, select: { name: true } })
  ]);
  if (!count) return NextResponse.json({ error: "Conteo no encontrado." }, { status: 404 });

  const entriesByTag = new Map(count.entries.map((entry) => [entry.tagId, entry]));
  const dateLabel = count.date.toISOString().slice(0, 10);
  const counters = Array.from(new Set(
    count.entries.flatMap((entry) => [entry.count1ByName, entry.count2ByName, entry.count3ByName]).filter((name): name is string => !!name)
  ));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Clarvex Team";
  // Resumen primero en el libro; se llena al final cuando ya hay totales.
  const resumen = workbook.addWorksheet("Resumen");

  // ── Hojas de detalle por zona ────────────────────────────────────────────
  const zoneTotals: Record<CycleZone, { tags: number; real: number; first: number }> = {
    PISO: { tags: 0, real: 0, first: 0 },
    BODEGA: { tags: 0, real: 0, first: 0 }
  };

  for (const zone of ["PISO", "BODEGA"] as const) {
    const sheet = workbook.addWorksheet(zone === "PISO" ? "Piso de Venta" : "Bodega");
    sheet.addRow(["FORMATO MESA DE CONTROL DEL INVENTARIO"]).font = { bold: true, size: 13 };
    sheet.addRow([zone === "PISO" ? "PISO DE VENTA" : "BODEGA"]).font = { bold: true };
    sheet.addRow(["Marca / Tienda:", store?.name ?? "Tienda"]);
    sheet.addRow(["Fecha:", dateLabel]);
    sheet.addRow([]);
    const header = sheet.addRow(["No Marbete", "1er Conteo", "2do Conteo", "Diferencia", "3er Conteo", "Real", "Contó"]);
    header.eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });

    for (const tag of tags.filter((t) => t.zone === zone)) {
      const entry = entriesByTag.get(tag.id) ?? null;
      const difference = entry ? entryDifference(entry) : null;
      const real = entry ? entryReal(entry) : null;
      zoneTotals[zone].tags += 1;
      zoneTotals[zone].real += real ?? 0;
      zoneTotals[zone].first += entry?.count1 ?? 0;
      const row = sheet.addRow([
        tag.number,
        entry?.count1 ?? "",
        entry?.count2 ?? "",
        difference ?? "",
        entry?.count3 ?? "",
        real ?? "",
        entry?.count1ByName ?? ""
      ]);
      if (difference !== null && difference !== 0) row.getCell(4).fill = DIFF_FILL;
    }

    const totals = sheet.addRow([
      "TOTAL",
      zoneTotals[zone].first,
      "",
      "",
      "",
      zoneTotals[zone].real,
      ""
    ]);
    totals.font = { bold: true };
    sheet.getColumn(1).width = 12;
    for (let col = 2; col <= 6; col += 1) sheet.getColumn(col).width = 12;
    sheet.getColumn(7).width = 22;
  }

  // ── Piezas Sin UPC ────────────────────────────────────────────────────────
  const noUpcSheet = workbook.addWorksheet("Piezas Sin UPC");
  const noUpcHeader = noUpcSheet.addRow(["Concepto", "Piezas"]);
  noUpcHeader.eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
  let noUpcTotal = 0;
  for (const item of count.noUpcItems) {
    noUpcSheet.addRow([item.concept, item.pieces]);
    noUpcTotal += item.pieces;
  }
  noUpcSheet.addRow(["TOTAL", noUpcTotal]).font = { bold: true };
  noUpcSheet.getColumn(1).width = 32;
  noUpcSheet.getColumn(2).width = 12;

  // ── Resumen ───────────────────────────────────────────────────────────────
  resumen.addRow(["INVENTARIO FÍSICO — FORMATO MESA DE CONTROL"]).font = { bold: true, size: 13 };
  resumen.addRow([]);
  resumen.addRow(["Tienda:", store?.name ?? "Tienda"]);
  resumen.addRow(["Fecha:", dateLabel]);
  resumen.addRow([]);
  const summaryHeader = resumen.addRow(["Marbetes utilizados", "Concepto", "Inv. Físico (Real)"]);
  summaryHeader.eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
  resumen.addRow([zoneTotals.PISO.tags, "Piso de Venta", zoneTotals.PISO.real]);
  resumen.addRow([zoneTotals.BODEGA.tags, "Bodega", zoneTotals.BODEGA.real]);
  resumen.addRow([count.noUpcItems.length, "Piezas Sin UPC", noUpcTotal]);
  const totalFisico = zoneTotals.PISO.real + zoneTotals.BODEGA.real + noUpcTotal;
  const totalRow = resumen.addRow([
    zoneTotals.PISO.tags + zoneTotals.BODEGA.tags,
    "Total Inv. Físico",
    totalFisico
  ]);
  totalRow.font = { bold: true };
  resumen.addRow([]);
  if (count.theoretical !== null) {
    resumen.addRow(["", "Teórico (sistema)", count.theoretical]);
    const diff = resumen.addRow(["", "Diferencia Neta", totalFisico - count.theoretical]);
    diff.font = { bold: true };
    if (totalFisico - count.theoretical !== 0) diff.getCell(3).fill = DIFF_FILL;
    resumen.addRow([]);
  }
  resumen.addRow(["Colaboradores:"]).font = { bold: true };
  for (const name of counters) resumen.addRow(["", name]);
  if (count.notes) { resumen.addRow([]); resumen.addRow(["Notas:", count.notes]); }
  resumen.getColumn(1).width = 20;
  resumen.getColumn(2).width = 26;
  resumen.getColumn(3).width = 16;

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `mesa-de-control-${dateLabel}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
