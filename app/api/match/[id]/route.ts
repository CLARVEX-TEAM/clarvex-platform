import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";

// PATCH — editar o cambiar estado (iniciar / finalizar) un partido.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    opponent?: string;
    opponentFlag?: string;
    competition?: string;
    kickoff?: string;
    mxScore?: number;
    rivalScore?: number;
  };

  const current = await prisma.matchEvent.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.status && ["SCHEDULED", "LIVE", "FINISHED"].includes(body.status)) data.status = body.status;
  if (typeof body.opponent === "string" && body.opponent.trim()) data.opponent = body.opponent.trim().slice(0, 60);
  if (typeof body.opponentFlag === "string") data.opponentFlag = body.opponentFlag.trim().slice(0, 8) || null;
  if (typeof body.competition === "string") data.competition = body.competition.trim().slice(0, 40) || null;
  if (body.kickoff) {
    const k = new Date(body.kickoff);
    if (!isNaN(k.getTime())) data.kickoff = k;
  }
  if (typeof body.mxScore === "number" && body.mxScore >= 0) data.mxScore = Math.floor(body.mxScore);
  if (typeof body.rivalScore === "number" && body.rivalScore >= 0) data.rivalScore = Math.floor(body.rivalScore);

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });

  const match = await prisma.matchEvent.update({ where: { id }, data });

  const newStatus = typeof data.status === "string" ? data.status : null;
  if (newStatus && newStatus !== current.status) {
    const users = await prisma.user.findMany({ select: { id: true } });
    const ids = users.map((u) => u.id);
    const flag = match.opponentFlag ? ` ${match.opponentFlag}` : "";
    const rival = `${match.opponent}${flag}`;
    const comp = match.competition ? ` · ${match.competition}` : "";

    if (newStatus === "LIVE") {
      void dispatchPushToUsers(ids, {
        title: `¡Arranca el partido! 🇲🇽⚽`,
        body: `México vs ${rival}${comp} — ¡ya están jugando!`,
        tag: `partido-live-${match.id}`,
        url: "/"
      });
    } else if (newStatus === "FINISHED") {
      const mxWon = match.mxScore > match.rivalScore;
      const draw = match.mxScore === match.rivalScore;
      const emoji = mxWon ? "🏆🎉" : draw ? "🤝" : "💪";
      void dispatchPushToUsers(ids, {
        title: `Partido terminado ${emoji}`,
        body: `México ${match.mxScore} - ${match.rivalScore} ${rival}`,
        tag: `partido-fin-${match.id}`,
        url: "/"
      });
    }
  }

  return NextResponse.json({ match: serializeMatch(match) });
}

// DELETE — eliminar un partido.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(["GERENTE", "SUBGERENTE"]);
  if (isApiError(session)) return session;

  await prisma.matchEvent.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
