import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { serializeDataSource } from "@/lib/data-source";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const simulatedRecords = {
  HORARIOS: 28,
  KPIS: 15,
  METAS: 5,
  COMISIONES: 9,
  COMUNICADOS: 4
} as const;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const source = await prisma.dataSource.findFirst({
    where: { id: params.id, storeId: session.storeId }
  });
  if (!source) return NextResponse.json({ error: "Fuente de datos no encontrada." }, { status: 404 });
  if (source.status === "DISCONNECTED") {
    return NextResponse.json({ error: "Configura la fuente antes de sincronizar." }, { status: 409 });
  }

  const log = await prisma.syncLog.create({
    data: {
      dataSourceId: source.id,
      status: "RUNNING",
      message: "Sincronizacion en curso.",
      recordsProcessed: 0
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const completedAt = new Date();
  const nextSyncAt = new Date(completedAt.getTime() + 24 * 60 * 60 * 1000);
  const recordsProcessed = simulatedRecords[source.type];

  try {
    const [, updated] = await prisma.$transaction([
      prisma.syncLog.update({
        where: { id: log.id },
        data: { status: "SUCCESS", message: "Sincronizacion completada", recordsProcessed }
      }),
      prisma.dataSource.update({
        where: { id: source.id },
        data: { status: "CONNECTED", lastSyncAt: completedAt, nextSyncAt },
        include: { syncLogs: { orderBy: { createdAt: "desc" }, take: 1 } }
      })
    ]);

    return NextResponse.json({
      message: "Sincronizacion completada",
      dataSource: serializeDataSource(updated)
    });
  } catch {
    await prisma.$transaction([
      prisma.syncLog.update({ where: { id: log.id }, data: { status: "ERROR", message: "La sincronizacion simulada fallo." } }),
      prisma.dataSource.update({ where: { id: source.id }, data: { status: "ERROR" } })
    ]);
    return NextResponse.json({ error: "No se pudo completar la sincronizacion." }, { status: 500 });
  }
}
