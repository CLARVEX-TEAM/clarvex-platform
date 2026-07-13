import { NextResponse } from "next/server";
import { requireSession, isApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { matchPhase, POST_WINDOW_MS, UPCOMING_WINDOW_MS, serializeMatch } from "@/lib/match";
import { syncLinkedMatch } from "@/lib/match-sync";

export const dynamic = "force-dynamic";

// Sync perezoso: el banner consulta esta ruta cada 15 s desde cada dispositivo,
// así que aprovechamos esas visitas para refrescar el marcador desde ESPN sin
// depender de un cron externo. Throttle global en memoria (una instancia PM2).
const LAZY_SYNC_INTERVAL_MS = 30_000;
let lastLazySyncAt = 0;

// GET — el partido relevante ahora mismo: uno EN VIVO, dentro de su ventana, o
// el próximo programado dentro de 48 h. Devuelve null si no hay nada.
export async function GET() {
  const session = await requireSession();
  if (isApiError(session)) return session;

  const now = Date.now();
  const match = await prisma.matchEvent.findFirst({
    where: {
      status: { not: "FINISHED" },
      // Un partido EN VIVO nunca sale de la ventana: con tiempos extra y
      // penales puede rebasar las 3 h desde el kickoff.
      OR: [
        { status: "LIVE" },
        { kickoff: { gte: new Date(now - POST_WINDOW_MS), lte: new Date(now + UPCOMING_WINDOW_MS) } }
      ]
    },
    orderBy: { kickoff: "asc" }
  });

  if (
    match?.externalId &&
    matchPhase({ kickoff: match.kickoff.toISOString(), status: match.status }) === "live" &&
    now - lastLazySyncAt >= LAZY_SYNC_INTERVAL_MS
  ) {
    lastLazySyncAt = now;
    // Fire-and-forget: la respuesta no espera a ESPN (hasta 8 s de timeout);
    // el siguiente poll del banner ya trae el marcador fresco.
    void syncLinkedMatch(match).catch(() => undefined);
  }

  return NextResponse.json({
    match: match ? serializeMatch(match) : null,
    canManage: session.platformAdmin === true
  });
}
