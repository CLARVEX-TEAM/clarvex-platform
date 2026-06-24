import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { searchMexicoFixtures } from "@/lib/football-api";

export const dynamic = "force-dynamic";

// GET /api/match/search?date=2026-06-24
export async function GET(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Fecha inválida (usa YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const fixtures = await searchMexicoFixtures(date);
    return NextResponse.json({ fixtures });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al consultar ESPN.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
