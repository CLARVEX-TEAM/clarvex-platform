import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE", "REGIONAL"]);
  if (isApiError(session)) return session;

  try {
    const [health, predictions] = await Promise.all([
      ClarvexIntelligence.getExecutiveHealth(session),
      ClarvexIntelligence.predictMetrics(session),
    ]);

    return NextResponse.json({ health, predictions });
  } catch (error: any) {
    console.error("[Executive Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al generar el panel ejecutivo IA." },
      { status: 500 }
    );
  }
}
