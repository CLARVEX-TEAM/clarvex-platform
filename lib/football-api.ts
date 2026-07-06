// Liga de ESPN configurable: fifa.world (Mundial) por default. Al terminar el
// torneo se cambia por env sin tocar código, p. ej. ESPN_LEAGUE=concacaf.nations.league
// o fifa.friendly, y ESPN_COMPETITION_LABEL con el nombre visible.
const ESPN_LEAGUE = process.env.ESPN_LEAGUE?.trim() || "fifa.world";
const COMPETITION_LABEL = process.env.ESPN_COMPETITION_LABEL?.trim() || "FIFA World Cup 2026";
const ESPN_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_LEAGUE}`;

type EspnCompetitor = {
  team: { id: string; displayName: string; abbreviation: string; logo?: string; logos?: Array<{ href: string }> };
  score: string;
  winner?: boolean;
  homeAway: "home" | "away";
};

type EspnEvent = {
  id: string;
  date: string;
  name: string;
  competitions: Array<{
    competitors: EspnCompetitor[];
    notes?: Array<{ headline?: string }>;
    status: {
      clock: number;
      displayClock: string;
      type: { id: string; name: string; shortDetail?: string; detail?: string; completed: boolean };
    };
  }>;
};

export type EspnFixture = {
  id: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  competition: string;
  statusName: string;
  involvesMexico: boolean;
};

async function espnFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${ESPN_BASE}${path}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`ESPN error ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

function isMexico(name: string) {
  return name.toLowerCase().includes("mexico") || name.toLowerCase().includes("méxico");
}

function parseEvent(event: EspnEvent): EspnFixture | null {
  const comp = event.competitions[0];
  if (!comp) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  return {
    id: parseInt(event.id),
    home: home.team.displayName,
    away: away.team.displayName,
    homeScore: parseInt(home.score) || 0,
    awayScore: parseInt(away.score) || 0,
    competition: COMPETITION_LABEL,
    statusName: comp.status.type.name,
    involvesMexico: isMexico(home.team.displayName) || isMexico(away.team.displayName)
  };
}

// Todos los partidos del torneo en una fecha (más el día anterior para cubrir
// la diferencia de zona horaria: 7pm México = medianoche UTC = otro día ESPN).
export async function searchFixturesByDate(dateIso: string): Promise<EspnFixture[]> {
  const dates = [dateIso, prevDay(dateIso)];
  const results: EspnFixture[] = [];
  for (const d of dates) {
    const param = d.replace(/-/g, "");
    try {
      const data = await espnFetch<{ events: EspnEvent[] }>(`/scoreboard?dates=${param}`);
      for (const e of data.events ?? []) {
        const f = parseEvent(e);
        if (f && !results.some((r) => r.id === f.id)) results.push(f);
      }
    } catch { /* ignorar errores por fecha individual */ }
  }
  // México primero: sigue siendo el caso más común al programar.
  return results.sort((a, b) => Number(b.involvesMexico) - Number(a.involvesMexico));
}

function prevDay(dateIso: string) {
  const d = new Date(dateIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Marcador en vivo de un fixture vinculado.
// - Partido de México (homeTeam null): busca a México por nombre, como siempre.
// - Partido genérico: mapea por local/visitante de ESPN (homeScore→mxScore).
export async function getEspnFixture(externalId: number, generic = false): Promise<{
  mxScore: number;
  rivalScore: number;
  live: boolean;
  finished: boolean;
} | null> {
  const data = await espnFetch<{
    header: {
      competitions: Array<{
        competitors: EspnCompetitor[];
        status: { type: { name: string; completed: boolean } };
      }>;
    };
  }>(`/summary?event=${externalId}`);

  const comp = data.header?.competitions?.[0];
  if (!comp) return null;

  const statusName = comp.status.type.name;
  const homeSide = comp.competitors.find((c) => c.homeAway === "home");
  const awaySide = comp.competitors.find((c) => c.homeAway === "away");
  const mxSide = comp.competitors.find((c) => isMexico(c.team.displayName));
  const rivalSide = comp.competitors.find((c) => !isMexico(c.team.displayName));

  const first = generic || !mxSide ? homeSide : mxSide;
  const second = generic || !mxSide ? awaySide : rivalSide;

  return {
    mxScore: parseInt(first?.score ?? "0") || 0,
    rivalScore: parseInt(second?.score ?? "0") || 0,
    live: statusName === "STATUS_IN_PROGRESS" || statusName === "STATUS_HALFTIME",
    finished: statusName === "STATUS_FINAL" || comp.status.type.completed
  };
}

// ── Cuadro del Mundial (sección /mundial) ────────────────────────────────────

export type BracketTeam = {
  name: string;
  abbrev: string;
  logo: string | null;
  score: number | null;
  winner: boolean;
};

export type BracketMatch = {
  id: number;
  round: string;
  kickoff: string;
  statusName: string;
  detail: string;
  home: BracketTeam | null;
  away: BracketTeam | null;
};

// Orden de las rondas de eliminación directa del Mundial 2026.
export const BRACKET_ROUNDS = ["Dieciseisavos", "Octavos", "Cuartos", "Semifinal", "Tercer lugar", "Final"] as const;

// Ventanas de fecha (UTC) de cada ronda — respaldo cuando ESPN no manda nota.
const ROUND_WINDOWS: Array<{ round: (typeof BRACKET_ROUNDS)[number]; from: string; to: string }> = [
  { round: "Dieciseisavos", from: "2026-06-28", to: "2026-07-03" },
  { round: "Octavos", from: "2026-07-04", to: "2026-07-08" },
  { round: "Cuartos", from: "2026-07-09", to: "2026-07-12" },
  { round: "Semifinal", from: "2026-07-13", to: "2026-07-16" },
  { round: "Tercer lugar", from: "2026-07-17", to: "2026-07-18" },
  { round: "Final", from: "2026-07-19", to: "2026-07-20" }
];

function roundFromEvent(event: EspnEvent): string {
  const note = event.competitions[0]?.notes?.[0]?.headline ?? "";
  if (/round of 32|dieciseisavos/i.test(note)) return "Dieciseisavos";
  if (/round of 16|octavos/i.test(note)) return "Octavos";
  if (/quarter|cuartos/i.test(note)) return "Cuartos";
  if (/semi/i.test(note)) return "Semifinal";
  if (/third|tercer/i.test(note)) return "Tercer lugar";
  if (/final/i.test(note)) return "Final";
  const day = event.date.slice(0, 10);
  return ROUND_WINDOWS.find((w) => day >= w.from && day <= w.to)?.round ?? "Octavos";
}

function bracketTeam(side: EspnCompetitor | undefined, started: boolean): BracketTeam | null {
  if (!side) return null;
  return {
    name: side.team.displayName,
    abbrev: side.team.abbreviation,
    logo: side.team.logo ?? side.team.logos?.[0]?.href ?? null,
    score: started ? parseInt(side.score) || 0 : null,
    winner: side.winner === true
  };
}

// Partidos de la fase final entre dos fechas (YYYYMMDD-YYYYMMDD en un request).
export async function getBracketFixtures(fromIso: string, toIso: string): Promise<BracketMatch[]> {
  const range = `${fromIso.replace(/-/g, "")}-${toIso.replace(/-/g, "")}`;
  const data = await espnFetch<{ events: EspnEvent[] }>(`/scoreboard?dates=${range}`);
  const matches: BracketMatch[] = [];
  for (const event of data.events ?? []) {
    const comp = event.competitions[0];
    if (!comp) continue;
    const statusName = comp.status.type.name;
    const started = statusName !== "STATUS_SCHEDULED";
    matches.push({
      id: parseInt(event.id),
      round: roundFromEvent(event),
      kickoff: event.date,
      statusName,
      detail: comp.status.type.shortDetail ?? comp.status.type.detail ?? "",
      home: bracketTeam(comp.competitors.find((c) => c.homeAway === "home"), started),
      away: bracketTeam(comp.competitors.find((c) => c.homeAway === "away"), started)
    });
  }
  return matches.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
