import { NextResponse } from "next/server";
import { requirePlatformAdmin, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { matchHome, serializeMatch } from "@/lib/match";
import { normalizeStreamUrl } from "@/lib/stream-url";

export const dynamic = "force-dynamic";

// PATCH — editar o cambiar estado (iniciar / finalizar) un partido.
// Solo platform admin: MatchEvent es global y los cambios disparan push a todos.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    homeTeam?: string | null;
    homeFlag?: string | null;
    opponent?: string;
    opponentFlag?: string;
    competition?: string;
    kickoff?: string;
    mxScore?: number;
    rivalScore?: number;
    externalId?: number | null;
    streamUrl?: string | null;
  };

  const current = await prisma.matchEvent.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Partido no encontrado." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.status && ["SCHEDULED", "LIVE", "FINISHED"].includes(body.status)) data.status = body.status;
  if (body.homeTeam === null) data.homeTeam = null;
  else if (typeof body.homeTeam === "string") data.homeTeam = body.homeTeam.trim().slice(0, 60) || null;
  if (body.homeFlag === null) data.homeFlag = null;
  else if (typeof body.homeFlag === "string") data.homeFlag = body.homeFlag.trim().slice(0, 8) || null;
  if (typeof body.opponent === "string" && body.opponent.trim()) data.opponent = body.opponent.trim().slice(0, 60);
  if (typeof body.opponentFlag === "string") data.opponentFlag = body.opponentFlag.trim().slice(0, 8) || null;
  if (typeof body.competition === "string") data.competition = body.competition.trim().slice(0, 40) || null;
  if (body.kickoff) {
    const k = new Date(body.kickoff);
    if (!isNaN(k.getTime())) data.kickoff = k;
  }
  // Tope 0–99: un número gigante reventaría el Int de Postgres con un 500.
  if (typeof body.mxScore === "number" && body.mxScore >= 0 && body.mxScore <= 99) data.mxScore = Math.floor(body.mxScore);
  if (typeof body.rivalScore === "number" && body.rivalScore >= 0 && body.rivalScore <= 99) data.rivalScore = Math.floor(body.rivalScore);
  if (body.externalId === null || (typeof body.externalId === "number" && body.externalId > 0)) data.externalId = body.externalId;
  if (body.streamUrl === null) data.streamUrl = null;
  else if (typeof body.streamUrl === "string") {
    const trimmed = body.streamUrl.trim().slice(0, 500);
    if (!trimmed) data.streamUrl = null;
    else if (/^https?:\/\//i.test(trimmed)) data.streamUrl = normalizeStreamUrl(trimmed);
    else return NextResponse.json({ error: "El enlace debe empezar con http:// o https://." }, { status: 400 });
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });

  const match = await prisma.matchEvent.update({ where: { id }, data });

  const newStatus = typeof data.status === "string" ? data.status : null;
  if (newStatus && newStatus !== current.status) {
    const users = await prisma.user.findMany({ select: { id: true } });
    const ids = users.map((u) => u.id);
    const home = matchHome(match);
    const homeName = home.flag ? `${home.flag} ${home.name}` : home.name;
    const flag = match.opponentFlag ? ` ${match.opponentFlag}` : "";
    const rival = `${match.opponent}${flag}`;
    const comp = match.competition ? ` · ${match.competition}` : "";

    if (newStatus === "LIVE") {
      void dispatchPushToUsers(ids, {
        title: home.isMexico ? "¡Arranca el partido! 🇲🇽⚽" : "¡Arranca el partido! ⚽🏆",
        body: `${homeName} vs ${rival}${comp} — ¡ya están jugando!`,
        tag: `partido-live-${match.id}`,
        url: "/"
      });
    } else if (newStatus === "FINISHED") {
      const mxWon = match.mxScore > match.rivalScore;
      const draw = match.mxScore === match.rivalScore;
      const emoji = home.isMexico ? (mxWon ? "🏆🎉" : draw ? "🤝" : "💪") : "🏁";
      void dispatchPushToUsers(ids, {
        title: `Partido terminado ${emoji}`,
        body: `${home.name} ${match.mxScore} - ${match.rivalScore} ${rival}`,
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
  const session = await requirePlatformAdmin();
  if (isApiError(session)) return session;

  await prisma.matchEvent.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
