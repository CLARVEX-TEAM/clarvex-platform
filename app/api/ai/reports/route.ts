import { NextResponse } from "next/server";
import { enforceAiRateLimit, requireSession, isApiError } from "@/lib/api";
import { toUserFacingCopilotError } from "@/lib/ai/errors";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const limited = await enforceAiRateLimit(session.userId);
  if (limited) return limited;

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
  } catch (error: unknown) {
    console.error("[IA Report Route Error]:", error);
    const facing = toUserFacingCopilotError(error);
    const message = error instanceof Error && /json|reporte incompleto/i.test(error.message)
      ? "No pudimos generar el reporte IA en este momento. Intenta de nuevo en unos segundos."
      : facing.message;
    return NextResponse.json({ error: message }, { status: facing.status });
  }
}
