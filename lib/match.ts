// Ventanas de tema: el banner "en vivo" se enciende solo desde 2 h antes del
// silbatazo hasta 3 h después (por si no se marca LIVE/FINISHED manualmente).
export const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const POST_WINDOW_MS = 3 * 60 * 60 * 1000;
// Para gerencia se muestra también el próximo partido si está dentro de 48 h.
export const UPCOMING_WINDOW_MS = 48 * 60 * 60 * 1000;

export type MatchPhase = "live" | "upcoming" | "past";

type MatchLike = { kickoff: string; status: string };

export function matchPhase(m: MatchLike, now = Date.now()): MatchPhase {
  if (m.status === "FINISHED") return "past";
  const k = new Date(m.kickoff).getTime();
  if (m.status === "LIVE") return "live";
  if (now >= k - PRE_WINDOW_MS && now <= k + POST_WINDOW_MS) return "live";
  if (now < k) return "upcoming";
  return "past";
}

export type SerializedMatch = {
  id: string;
  externalId: number | null;
  homeTeam: string | null;
  homeFlag: string | null;
  opponent: string;
  opponentFlag: string | null;
  competition: string | null;
  streamUrl: string | null;
  kickoff: string;
  mxScore: number;
  rivalScore: number;
  status: string;
};

export function serializeMatch(m: {
  id: string;
  externalId?: number | null;
  homeTeam?: string | null;
  homeFlag?: string | null;
  opponent: string;
  opponentFlag: string | null;
  competition: string | null;
  streamUrl?: string | null;
  kickoff: Date;
  mxScore: number;
  rivalScore: number;
  status: string;
}): SerializedMatch {
  return {
    id: m.id,
    externalId: m.externalId ?? null,
    homeTeam: m.homeTeam ?? null,
    homeFlag: m.homeFlag ?? null,
    opponent: m.opponent,
    opponentFlag: m.opponentFlag,
    competition: m.competition,
    streamUrl: m.streamUrl ?? null,
    kickoff: m.kickoff.toISOString(),
    mxScore: m.mxScore,
    rivalScore: m.rivalScore,
    status: m.status
  };
}

// Equipo local del partido. Sin homeTeam es un partido de México (modo
// histórico: tema tricolor, textos de la Selección). Con homeTeam es un
// partido genérico del Mundial (tema FIFA).
export function matchHome(m: { homeTeam?: string | null; homeFlag?: string | null }) {
  const isMexico = !m.homeTeam;
  return {
    isMexico,
    name: m.homeTeam ?? "México",
    flag: m.homeFlag ?? (isMexico ? "🇲🇽" : "")
  };
}
