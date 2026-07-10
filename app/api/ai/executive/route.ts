import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Panel ejecutivo / resumen IA deshabilitado en Inicio para evitar cifras
 * inconsistentes. El Copilot sigue disponible para consultas puntuales.
 */
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE", "REGIONAL"]);
  if (isApiError(session)) return session;

  return NextResponse.json(
    { error: "El análisis operativo y el resumen con IA están deshabilitados. Usa el Copilot o la pestaña KPIs." },
    { status: 410 }
  );
}
