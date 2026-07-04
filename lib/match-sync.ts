import type { MatchEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchPushToUsers } from "@/lib/push";
import { getEspnFixture } from "@/lib/football-api";

// Solo vale la pena consultar ESPN cerca del silbatazo: sin la ventana el
// sync podía engancharse a un partido futuro arbitrario (con varios
// programados) y golpear la API cada minuto durante días.
export const SYNC_WINDOW_MS = 6 * 60 * 60 * 1000;

export function findSyncableMatch() {
  const now = Date.now();
  return prisma.matchEvent.findFirst({
    where: {
      status: { not: "FINISHED" },
      externalId: { not: null },
      kickoff: { gte: new Date(now - SYNC_WINDOW_MS), lte: new Date(now + SYNC_WINDOW_MS) }
    },
    orderBy: { kickoff: "asc" }
  });
}

export type MatchSyncResult =
  | { skipped: true; reason: string }
  | { skipped: false; updated: MatchEvent; mxGoals: number; rivalGoals: number; statusChange: string | null };

// Trae el marcador de ESPN, actualiza el partido (con guarda optimista contra
// goles manuales simultáneos) y manda los push de gol / arranque / final.
export async function syncLinkedMatch(match: MatchEvent): Promise<MatchSyncResult> {
  if (!match.externalId) return { skipped: true, reason: "Partido sin vincular" };

  const fixture = await getEspnFixture(match.externalId);
  if (!fixture) return { skipped: true, reason: "Fixture no encontrado en ESPN" };

  const { mxScore, rivalScore, live, finished } = fixture;
  const prevMx = match.mxScore;
  const prevRival = match.rivalScore;
  const newStatus = finished ? "FINISHED" : live ? "LIVE" : match.status;

  if (mxScore === prevMx && rivalScore === prevRival && newStatus === match.status) {
    return { skipped: true, reason: "Sin cambios" };
  }

  // Guarda optimista: si el marcador cambió entre la lectura y esta escritura
  // (gol manual del gerente), no pisarlo — el siguiente tick reconcilia.
  const guarded = await prisma.matchEvent.updateMany({
    where: { id: match.id, mxScore: prevMx, rivalScore: prevRival },
    data: { mxScore, rivalScore, status: newStatus }
  });
  if (guarded.count === 0) {
    return { skipped: true, reason: "Marcador modificado durante el sync" };
  }
  const updated = await prisma.matchEvent.findUniqueOrThrow({ where: { id: match.id } });

  const users = await prisma.user.findMany({ select: { id: true } });
  const ids = users.map((u) => u.id);
  const flag = match.opponentFlag ? ` ${match.opponentFlag}` : "";
  const rival = `${match.opponent}${flag}`;
  const comp = match.competition ? ` · ${match.competition}` : "";
  const pushes: Promise<unknown>[] = [];

  const mxGoals = mxScore - prevMx;
  for (let i = 0; i < mxGoals; i++) {
    const partial = prevMx + i + 1;
    pushes.push(dispatchPushToUsers(ids, {
      title: "¡GOOOOL de México! 🇲🇽⚽",
      body: `México ${partial} - ${rivalScore} ${rival}`,
      tag: `gol-mexico-${match.id}-${partial}`,
      url: "/"
    }));
  }

  const rivalGoals = rivalScore - prevRival;
  for (let i = 0; i < rivalGoals; i++) {
    const partial = prevRival + i + 1;
    pushes.push(dispatchPushToUsers(ids, {
      title: `Gol del rival 😬`,
      body: `México ${mxScore} - ${partial} ${rival}`,
      tag: `gol-rival-${match.id}-${partial}`,
      url: "/"
    }));
  }

  if (finished && match.status !== "FINISHED") {
    const emoji = mxScore > rivalScore ? "🏆🎉" : mxScore === rivalScore ? "🤝" : "💪";
    pushes.push(dispatchPushToUsers(ids, {
      title: `Partido terminado ${emoji}`,
      body: `México ${mxScore} - ${rivalScore} ${rival}${comp}`,
      tag: `partido-fin-${match.id}`,
      url: "/"
    }));
  }

  if (live && match.status === "SCHEDULED" && mxGoals === 0 && rivalGoals === 0) {
    pushes.push(dispatchPushToUsers(ids, {
      title: `¡Arranca el partido! 🇲🇽⚽`,
      body: `México vs ${rival}${comp} — ¡ya están jugando!`,
      tag: `partido-live-${match.id}`,
      url: "/"
    }));
  }

  await Promise.allSettled(pushes);

  return {
    skipped: false,
    updated,
    mxGoals,
    rivalGoals,
    statusChange: newStatus !== match.status ? `${match.status} → ${newStatus}` : null
  };
}
