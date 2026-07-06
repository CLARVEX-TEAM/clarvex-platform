import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { matchHome, serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";

// POST — registrar un gol. { team: "MX" | "RIVAL" }. Un gol de México notifica
// a todo el equipo al instante.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const body = (await request.json().catch(() => ({}))) as { team?: string };
  const team = body.team === "RIVAL" ? "RIVAL" : "MX";

  const current = await prisma.matchEvent.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });

  const match = await prisma.matchEvent.update({
    where: { id },
    data: {
      // El primer gol pone el partido EN VIVO si seguía como programado.
      status: current.status === "SCHEDULED" ? "LIVE" : current.status,
      ...(team === "MX" ? { mxScore: { increment: 1 } } : { rivalScore: { increment: 1 } })
    }
  });

  const home = matchHome(match);
  if (team === "MX" || !home.isMexico) {
    // En partidos genéricos también se notifica el gol del visitante.
    const scorer = team === "MX" ? home.name : match.opponent;
    const users = await prisma.user.findMany({ select: { id: true } });
    const flag = match.opponentFlag ? ` ${match.opponentFlag}` : "";
    void dispatchPushToUsers(
      users.map((u) => u.id),
      {
        title: home.isMexico ? "¡GOOOOL de México! 🇲🇽⚽" : `¡Gol de ${scorer}! ⚽`,
        body: `${home.name} ${match.mxScore} - ${match.rivalScore} ${match.opponent}${flag}`,
        tag: `gol-${team === "MX" ? "mexico" : "rival"}-${match.id}`,
        url: "/"
      }
    );
  }

  return NextResponse.json({ match: serializeMatch(match) });
}
