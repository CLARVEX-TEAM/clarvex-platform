import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { getFixture, extractScore, isFixtureFinished } from "@/lib/football-api";
import { serializeMatch } from "@/lib/match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/cron/match-sync
// Llamar cada minuto mientras haya partido. Detecta goles automáticamente.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!process.env.FOOTBALL_API_KEY) {
    return NextResponse.json({ skipped: true, reason: "FOOTBALL_API_KEY no configurado" });
  }

  // Buscar partido activo con externalId que no esté finalizado.
  const match = await prisma.matchEvent.findFirst({
    where: { status: { not: "FINISHED" }, externalId: { not: null } }
  });

  if (!match?.externalId) {
    return NextResponse.json({ skipped: true, reason: "Sin partido activo vinculado" });
  }

  let fixture;
  try {
    fixture = await getFixture(match.externalId);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  if (!fixture) {
    return NextResponse.json({ skipped: true, reason: "Fixture no encontrado en api-football" });
  }

  const { mxScore, rivalScore } = extractScore(fixture);
  const finished = isFixtureFinished(fixture);
  const nowLive = fixture.fixture.status.short !== "NS";

  const prevMx = match.mxScore;
  const prevRival = match.rivalScore;

  const newStatus = finished ? "FINISHED" : nowLive ? "LIVE" : match.status;

  // Nada cambió.
  if (mxScore === prevMx && rivalScore === prevRival && newStatus === match.status) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const updated = await prisma.matchEvent.update({
    where: { id: match.id },
    data: { mxScore, rivalScore, status: newStatus }
  });

  const users = await prisma.user.findMany({ select: { id: true } });
  const ids = users.map((u) => u.id);
  const flag = match.opponentFlag ? ` ${match.opponentFlag}` : "";
  const rival = `${match.opponent}${flag}`;
  const comp = match.competition ? ` · ${match.competition}` : "";

  const pushes: Promise<unknown>[] = [];

  // Goles nuevos de México.
  const mxGoals = mxScore - prevMx;
  for (let i = 0; i < mxGoals; i++) {
    const partial = prevMx + i + 1;
    pushes.push(
      dispatchPushToUsers(ids, {
        title: "¡GOOOOL de México! 🇲🇽⚽",
        body: `México ${partial} - ${rivalScore} ${rival}`,
        tag: `gol-mexico-${match.id}-${partial}`,
        url: "/"
      })
    );
  }

  // Goles del rival.
  const rivalGoals = rivalScore - prevRival;
  for (let i = 0; i < rivalGoals; i++) {
    const partial = prevRival + i + 1;
    pushes.push(
      dispatchPushToUsers(ids, {
        title: `Gol del rival 😬`,
        body: `México ${mxScore} - ${partial} ${rival}`,
        tag: `gol-rival-${match.id}-${partial}`,
        url: "/"
      })
    );
  }

  // Partido terminado.
  if (finished && match.status !== "FINISHED") {
    const mxWon = mxScore > rivalScore;
    const draw = mxScore === rivalScore;
    const emoji = mxWon ? "🏆🎉" : draw ? "🤝" : "💪";
    pushes.push(
      dispatchPushToUsers(ids, {
        title: `Partido terminado ${emoji}`,
        body: `México ${mxScore} - ${rivalScore} ${rival}${comp}`,
        tag: `partido-fin-${match.id}`,
        url: "/"
      })
    );
  }

  // Partido inició (SCHEDULED → LIVE).
  if (nowLive && match.status === "SCHEDULED" && mxGoals === 0 && rivalGoals === 0) {
    pushes.push(
      dispatchPushToUsers(ids, {
        title: `¡Arranca el partido! 🇲🇽⚽`,
        body: `México vs ${rival}${comp} — ¡ya están jugando!`,
        tag: `partido-live-${match.id}`,
        url: "/"
      })
    );
  }

  await Promise.allSettled(pushes);

  return NextResponse.json({
    ok: true,
    match: serializeMatch(updated),
    mxGoals,
    rivalGoals,
    statusChange: newStatus !== match.status ? `${match.status} → ${newStatus}` : null
  });
}
