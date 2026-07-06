import path from "node:path";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSession, isApiError } from "@/lib/api";
import { fillMesaControl, type MesaControlRow } from "@/lib/mesa-control";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "mesa-de-control.xlsx");

// GET — Mesa de Control del conteo en el formato oficial (plantilla AXO).
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
  const zoneRows = (zone: "PISO" | "BODEGA"): MesaControlRow[] =>
    tags.filter((tag) => tag.zone === zone).map((tag) => {
      const entry = entriesByTag.get(tag.id) ?? null;
      return {
        number: tag.number,
        count1: entry?.count1 ?? null,
        count2: entry?.count2 ?? null,
        count3: entry?.count3 ?? null
      };
    });

  // Colaboradores del conteo por rol (los nombres vienen del snapshot de cada
  // captura; el rol se resuelve contra los usuarios actuales).
  const counterIds = Array.from(new Set(
    count.entries.flatMap((entry) => [entry.count1ById, entry.count2ById, entry.count3ById]).filter((v): v is string => !!v)
  ));
  const users = counterIds.length
    ? await prisma.user.findMany({ where: { id: { in: counterIds } }, select: { id: true, name: true, role: true } })
    : [];
  const byRole = (role: "GERENTE" | "SUBGERENTE" | "ASESOR") => users.filter((user) => user.role === role).map((user) => user.name);
  const team = {
    gerente: byRole("GERENTE")[0] ?? null,
    subgerente: byRole("SUBGERENTE")[0] ?? null,
    vendedores: [...byRole("ASESOR"), ...byRole("GERENTE").slice(1), ...byRole("SUBGERENTE").slice(1)]
  };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  fillMesaControl(workbook, {
    date: count.date,
    sucursal: store?.name ?? "",
    theoretical: count.theoretical,
    piso: zoneRows("PISO"),
    bodega: zoneRows("BODEGA"),
    noUpc: count.noUpcItems.map((item) => ({ concept: item.concept, pieces: item.pieces })),
    team
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const dateLabel = count.date.toISOString().slice(0, 10);
  const fileName = `Mesa_de_Control_de_Inventarios_${dateLabel}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
