import { NextResponse } from "next/server";
import { requireAdminCapture } from "@/lib/admin-capture-auth";
import { exportRdvWorkbook, listRdvMonths } from "@/lib/rdv-export-xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = requireAdminCapture(request);
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId")?.trim();

  /*
   * `?months=1` devuelve qué meses se pueden exportar, sin generar ninguno.
   *
   * Vive aquí y no en una ruta aparte porque es la misma pregunta: quien sabe
   * armar el RDV es quien sabe de qué periodos puede armarlo. Separarlo daría
   * dos sitios donde decidir qué es un mes válido.
   */
  if (params.get("months") === "1") {
    if (!storeId) return NextResponse.json({ error: "Falta la tienda." }, { status: 400 });
    return NextResponse.json({ ok: true, months: await listRdvMonths(storeId) });
  }

  const selectedDate = parseDay(params.get("date") ?? params.get("selectedDate"));
  if (!storeId || !selectedDate) {
    return NextResponse.json({ error: "Falta tienda o fecha valida para exportar el RDV." }, { status: 400 });
  }

  try {
    const result = await exportRdvWorkbook(storeId, selectedDate, {
      brand: params.get("brand"),
      center: params.get("center"),
      classification: params.get("classification"),
      crmObjective: parsePositiveNumber(params.get("crmObjective"))
    });
    const contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (params.get("format") === "base64") {
      return NextResponse.json({
        ok: true,
        filename: result.filename,
        contentType,
        base64: result.buffer.toString("base64"),
        period: result.state.retailMonth,
        people: result.state.people.length
      });
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="rdv.xlsx"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo exportar el RDV." }, { status: 422 });
  }
}

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePositiveNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
