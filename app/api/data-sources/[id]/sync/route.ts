import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { encodeSyncLogMessage, getNextSyncAt, serializeDataSource } from "@/lib/data-source";
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

  const log = await prisma.syncLog.create({
    data: {
      dataSourceId: source.id,
      status: "RUNNING",
      message: encodeSyncLogMessage("Sincronizacion en curso."),
      recordsProcessed: 0
    }
  });

  try {
    const workbook = await downloadWorkbookSummary(source.url);
    const completedAt = new Date();
    const nextSyncAt = getNextSyncAt(source.frequency, completedAt);
    const successMessage = "Sincronizacion completada";
    const [, updated] = await prisma.$transaction([
      prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "SUCCESS",
          message: encodeSyncLogMessage(successMessage, workbook.sheets),
          recordsProcessed: workbook.recordsProcessed
        }
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { status: "CONNECTED", lastSyncAt: completedAt, nextSyncAt },
        include: { syncLogs: { orderBy: { createdAt: "desc" }, take: 1 } }
      })
    ]);

    return NextResponse.json({
      message: successMessage,
      workbook,
      dataSource: serializeDataSource(updated)
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "No se pudo completar la sincronizacion.";
    await prisma.$transaction([
      prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "ERROR", message: encodeSyncLogMessage(errorMessage), recordsProcessed: 0 }
      }),
      prisma.dataSource.update({ where: { id: source.id }, data: { status: "ERROR" } })
    ]);
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}
