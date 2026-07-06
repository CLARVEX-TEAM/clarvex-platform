import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { BRACKET_ROUNDS, getBracketFixtures, type BracketMatch } from "@/lib/football-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Fase final del Mundial 2026 (dieciseisavos a final).
const BRACKET_FROM = "2026-06-28";
const BRACKET_TO = "2026-07-20";

// Caché en memoria: el cuadro lo consultan todos los dispositivos; con 60 s
// de vida ESPN recibe como máximo un request por minuto por instancia.
let cache: { at: number; rounds: Array<{ name: string; matches: BracketMatch[] }> } | null = null;
const CACHE_MS = 60_000;

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ rounds: cache.rounds, cached: true });
  }

  try {
    const matches = await getBracketFixtures(BRACKET_FROM, BRACKET_TO);
    const rounds = BRACKET_ROUNDS
      .map((name) => ({ name: name as string, matches: matches.filter((match) => match.round === name) }))
      .filter((round) => round.matches.length > 0);
    cache = { at: Date.now(), rounds };
    return NextResponse.json({ rounds });
  } catch (err) {
    // Si ESPN falla, servir el último cuadro conocido antes que un error.
    if (cache) return NextResponse.json({ rounds: cache.rounds, stale: true });
    const msg = err instanceof Error ? err.message : "Error al consultar ESPN.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
