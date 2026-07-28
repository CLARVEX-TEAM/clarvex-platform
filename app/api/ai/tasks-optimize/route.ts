import { NextResponse } from "next/server";
import { denyDemo, enforceAiRateLimit, requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;
  const demo = denyDemo(session);
  if (demo) return demo;
  const limited = await enforceAiRateLimit(session.userId);
  if (limited) return limited;

  try {
    const optimization = await ClarvexIntelligence.optimizeTasks(session);
    return NextResponse.json(optimization);
  } catch (error: any) {
    console.error("[Tasks Optimize Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al optimizar tareas pendientes." },
      { status: 500 }
    );
  }
}
