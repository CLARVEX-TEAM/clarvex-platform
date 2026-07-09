import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { ClarvexIntelligence } from "@/lib/clarvex-intelligence";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;

  try {
    const { query } = await request.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Consulta vacía o inválida." }, { status: 400 });
    }

    const answer = await ClarvexIntelligence.askCopilot(session, query);
    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("[Copilot Route Error]:", error);
    return NextResponse.json(
      { error: error.message || "Error al procesar la respuesta del copiloto." },
      { status: 500 }
    );
  }
}
