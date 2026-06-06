import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { serializeDataSource } from "@/lib/data-source";
import { downloadWorkbookSummary } from "@/lib/excel-proxy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const source = await prisma.dataSource.findFirst({
    where: { id: params.id, storeId: session.storeId }
  });
  if (!source) return NextResponse.json({ error: "Fuente de datos no encontrada." }, { status: 404 });
  if (source.provider === "MANUAL") {
    return NextResponse.json({ error: "Selecciona Excel o SharePoint para probar la conexion." }, { status: 409 });
  }

  try {
    const workbook = await downloadWorkbookSummary(source.url);
    const updated = await prisma.dataSource.update({
      where: { id: source.id },
      data: { status: "CONNECTED" },
      include: { syncLogs: { orderBy: { createdAt: "desc" }, take: 1 } }
    });

    return NextResponse.json({
      message: `Conexion correcta. ${workbook.sheets.length} hojas detectadas.`,
      workbook,
      dataSource: serializeDataSource(updated)
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "No se pudo probar la conexion.";
    await prisma.dataSource.update({ where: { id: source.id }, data: { status: "ERROR" } });
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}
