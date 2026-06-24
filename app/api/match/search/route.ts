import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { searchMexicoFixtures, MEXICO_TEAM_ID } from "@/lib/football-api";

export const dynamic = "force-dynamic";

// GET /api/match/search?date=2026-06-24
// Busca partidos de México en api-football para la fecha dada.
export async function GET(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Fecha inválida (usa YYYY-MM-DD)." }, { status: 400 });
  }

  if (!process.env.FOOTBALL_API_KEY) {
    return NextResponse.json({ error: "FOOTBALL_API_KEY no configurado." }, { status: 503 });
  }

  try {
    const data = await searchMexicoFixtures(date);
    const fixtures = data.response.map((f) => {
      const mxIsHome = f.teams.home.id === MEXICO_TEAM_ID;
      const rival = mxIsHome ? f.teams.away : f.teams.home;
      return {
        externalId: f.fixture.id,
        rival: rival.name,
        competition: f.league.name,
        kickoff: f.fixture.status.short === "NS"
          ? new Date(date).toISOString()
          : null,
        status: f.fixture.status.short
      };
    });
    return NextResponse.json({ fixtures });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al consultar api-football.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
