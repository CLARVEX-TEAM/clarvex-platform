import { NextResponse } from "next/server";
import { DATA_SOURCE_ROLES } from "@/lib/access-control";
import { isApiError, requireSession } from "@/lib/api";
import { syncDataSource } from "@/lib/data-source-sync";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(DATA_SOURCE_ROLES);
  if (isApiError(session)) return session;

  const source = await prisma.dataSource.findFirst({
    where: { id, storeId: session.storeId }
  });
  if (!source) return NextResponse.json({ error: "Fuente de datos no encontrada." }, { status: 404 });
  if (source.provider === "MANUAL") {
    return NextResponse.json({ error: "Selecciona Excel o SharePoint para sincronizar este modulo." }, { status: 409 });
  }

  const outcome = await syncDataSource(source);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 502 });
  }

  const { message, workbook, scheduleMetrics, kpiMetrics, discountMetrics, dataSource } = outcome;
  return NextResponse.json({
    message,
    workbook,
    ...(scheduleMetrics ? {
      registrosProcesados: scheduleMetrics.recordsProcessed,
      registrosCreados: scheduleMetrics.recordsCreated,
      registrosActualizados: scheduleMetrics.recordsUpdated,
      errores: scheduleMetrics.errors,
      empleadosNoEncontrados: scheduleMetrics.employeesNotFound,
      valoresDesconocidos: scheduleMetrics.unknownValues
    } : kpiMetrics ? {
      hojaUsada: kpiMetrics.sheetUsed,
      semanasDetectadas: kpiMetrics.weeksDetected,
      mesRetail: kpiMetrics.retailMonthLabel,
      inicioMesRetail: kpiMetrics.retailMonthStart,
      finMesRetail: kpiMetrics.retailMonthEnd,
      colaboradoresDetectados: kpiMetrics.collaboratorsDetected,
      empleadosProcesados: kpiMetrics.employeesProcessed,
      filasLeidas: kpiMetrics.rowsRead,
      registrosSincronizados: kpiMetrics.recordsCreated + kpiMetrics.recordsUpdated,
      registrosCreados: kpiMetrics.recordsCreated,
      registrosActualizados: kpiMetrics.recordsUpdated,
      filasIgnoradas: kpiMetrics.ignoredRows,
      totalVentaImportada: kpiMetrics.totalSalesImported,
      totalMetaImportada: kpiMetrics.totalGoalImported,
      empleadosNoEncontrados: kpiMetrics.employeesNotFound,
      errores: kpiMetrics.errors,
      transaccionesCrmProcesadas: kpiMetrics.crmTransactionsProcessed
    } : discountMetrics ? {
      semanasDetectadas: discountMetrics.weekNumbers,
      empleadosEncontrados: discountMetrics.employeesFound,
      registrosProcesados: discountMetrics.recordsProcessed,
      registrosActualizados: discountMetrics.recordsUpdated,
      empleadosNoEncontrados: discountMetrics.employeesNotFound,
      errores: discountMetrics.errors
    } : {}),
    dataSource
  });
}
