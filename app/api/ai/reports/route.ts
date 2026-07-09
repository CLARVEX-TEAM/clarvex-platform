import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const params = new URL(request.url).searchParams;
  const type = (params.get("type") || "WEEKLY") as "DAILY" | "WEEKLY" | "MONTHLY";
  const startStr = params.get("start");
  const endStr = params.get("end");

  if (!startStr || !endStr) {
    return NextResponse.json(
      { error: "Parámetros start y end requeridos (formato YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  try {
    const report = await ClarvexIntelligence.generateIaReport(session, type, startStr, endStr);
    return NextResponse.json(report);
  } catch (error: any) {
    console.error("[IA Report Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al generar el reporte con IA." },
      { status: 500 }
    );
  }
}
