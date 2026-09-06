import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { getWeeklyPerformance } from "@/lib/weekly-performance";
import {
  buildWeeklyPerformanceWorkbook,
  type WeeklyPerformanceDocument
} from "@/lib/weekly-performance-xlsx";
import { buildWeeklyPerformancePdf } from "@/lib/weekly-performance-pdf";
import { convertirXlsxAPdf } from "@/lib/xlsx-a-pdf";
import type { WeeklyPerformanceState } from "@/lib/weekly-performance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * El PDF sale del MISMO XLSX que se descarga, convertido con LibreOffice.
 *
 * ⚠️ Antes se dibujaba aparte con pdf-lib y por eso no se parecía al formato
 * corporativo: eran dos generadores independientes. El XLSX ya es la plantilla,
 * así que convertirlo da el documento exacto.
 *
 * ⚠️ **El dibujo anterior se conserva como respaldo.** Si LibreOffice no está
 * instalado —una máquina de desarrollo, o el servidor antes de aprovisionarlo—
 * el gerente sigue bajando un PDF utilizable en vez de un error. Se registra
 * cuál de los dos salió: sin esa línea, un servidor sin LibreOffice serviría el
 * PDF viejo indefinidamente y nadie sabría por qué «volvió a verse raro».
 */
async function construirPdf(state: WeeklyPerformanceState, document: WeeklyPerformanceDocument): Promise<Buffer> {
  try {
    const xlsx = await buildWeeklyPerformanceWorkbook(state, document, { soloDocumento: true });
    return await convertirXlsxAPdf(xlsx);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.warn(`[weekly-performance] PDF por conversión no disponible, se usa el trazado propio: ${detalle}`);
    return buildWeeklyPerformancePdf(state, document);
  }
}

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId") ?? "";
  const reportWeekStart = parseDay(params.get("reportWeekStart") ?? params.get("weekStart"));
  const quotaWeekStart = parseDay(params.get("quotaWeekStart")) ?? nextWeek(reportWeekStart);
  const document = parseDocument(params.get("document"));
  const output = parseOutput(params.get("output"));
  if (!document) return NextResponse.json({ error: "Tipo de archivo invalido." }, { status: 400 });
  if (!output) return NextResponse.json({ error: "Formato de exportacion invalido." }, { status: 400 });
  if (!storeId || !reportWeekStart || !quotaWeekStart) return NextResponse.json({ error: "Tienda o semanas inválidas." }, { status: 400 });
  try {
    const state = await getWeeklyPerformance(storeId, reportWeekStart, quotaWeekStart);
    const buffer = output === "pdf"
      ? await construirPdf(state, document)
      : await buildWeeklyPerformanceWorkbook(state, document);
    const filename = documentFilename(document, state.quotaWeek.weekNumber, state.reportWeek.weekNumber, output);
    const contentType = output === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (params.get("format") === "base64") {
      return NextResponse.json({
        ok: true, filename,
        contentType,
        base64: buffer.toString("base64")
      });
    }
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo exportar el documento." }, { status: 422 });
  }
}

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function nextWeek(value: Date | null) { return value ? new Date(value.getTime() + 7 * 86_400_000) : null; }
function parseDocument(value: string | null): WeeklyPerformanceDocument | null {
  if (!value) return "combined";
  return value === "combined" || value === "quota" || value === "rds" ? value : null;
}
function parseOutput(value: string | null): "xlsx" | "pdf" | null {
  if (!value) return "xlsx";
  return value === "xlsx" || value === "pdf" ? value : null;
}
function documentFilename(document: WeeklyPerformanceDocument, quotaWeek: number, reportWeek: number, output: "xlsx" | "pdf") {
  if (document === "quota") return `CUOTA-JUSTA-S${quotaWeek}.${output}`;
  if (document === "rds") return `RDS-S${reportWeek}.${output}`;
  return `CUOTA-JUSTA-S${quotaWeek}-RDS-S${reportWeek}.${output}`;
}
