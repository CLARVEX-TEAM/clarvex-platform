import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Resumen diario con IA deshabilitado. Usar Copilot o pestaña KPIs. */
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE", "ASESOR", "REGIONAL"]);
  if (isApiError(session)) return session;

  return NextResponse.json(
    { error: "El resumen diario con IA está deshabilitado. Usa el Copilot o la pestaña KPIs." },
    { status: 410 }
  );
}
