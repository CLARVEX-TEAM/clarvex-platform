import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";

// GET — lista de partidos (para el panel de gerencia).
export async function GET() {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const matches = await prisma.matchEvent.findMany({ orderBy: { kickoff: "desc" }, take: 50 });
  return NextResponse.json({ matches: matches.map(serializeMatch) });
}

// POST — programar un partido (gerencia).
export async function POST(request: Request) {
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const body = (await request.json().catch(() => ({}))) as {
    opponent?: string;
    opponentFlag?: string;
    competition?: string;
    kickoff?: string;
  };

  const opponent = body.opponent?.trim();
  if (!opponent) return NextResponse.json({ error: "Indica el rival." }, { status: 400 });
  const kickoff = body.kickoff ? new Date(body.kickoff) : null;
  if (!kickoff || isNaN(kickoff.getTime())) return NextResponse.json({ error: "Fecha/hora inválida." }, { status: 400 });

  const match = await prisma.matchEvent.create({
    data: {
      opponent: opponent.slice(0, 60),
      opponentFlag: body.opponentFlag?.trim().slice(0, 8) || null,
      competition: body.competition?.trim().slice(0, 40) || null,
      kickoff
    }
  });

  return NextResponse.json({ match: serializeMatch(match) }, { status: 201 });
}
