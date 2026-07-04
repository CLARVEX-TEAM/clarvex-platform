// Liga de ESPN configurable: fifa.world (Mundial) por default. Al terminar el
// torneo se cambia por env sin tocar código, p. ej. ESPN_LEAGUE=concacaf.nations.league
// o fifa.friendly, y ESPN_COMPETITION_LABEL con el nombre visible.
const ESPN_LEAGUE = process.env.ESPN_LEAGUE?.trim() || "fifa.world";
const COMPETITION_LABEL = process.env.ESPN_COMPETITION_LABEL?.trim() || "FIFA World Cup 2026";
const ESPN_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_LEAGUE}`;

type EspnCompetitor = {
  team: { id: string; displayName: string; abbreviation: string };
  score: string;
  homeAway: "home" | "away";
};

type EspnEvent = {
  id: string;
  name: string;
  competitions: Array<{
    competitors: EspnCompetitor[];
    status: {
      clock: number;
      displayClock: string;
      type: { id: string; name: string; completed: boolean };
    };
  }>;
};

export type EspnFixture = {
  id: number;
  rival: string;
  competition: string;
  mxScore: number;
  rivalScore: number;
  statusName: string;
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
  const mx = comp.competitors.find((c) => isMexico(c.team.displayName));
  const rival = comp.competitors.find((c) => !isMexico(c.team.displayName));
  if (!mx || !rival) return null;
  return {
    id: parseInt(event.id),
    rival: rival.team.displayName,
    competition: COMPETITION_LABEL,
    mxScore: parseInt(mx.score) || 0,
    rivalScore: parseInt(rival.score) || 0,
    statusName: comp.status.type.name
  };
}

export async function searchMexicoFixtures(dateIso: string): Promise<EspnFixture[]> {
  // Buscamos en la fecha dada y el día anterior para cubrir diferencias de zona horaria
  // (partido a las 7pm México CDT = medianoche UTC = día siguiente en la API de ESPN).
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
  return results;
}

function prevDay(dateIso: string) {
  const d = new Date(dateIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getEspnFixture(externalId: number): Promise<{
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

  const mx = comp.competitors.find((c) => isMexico(c.team.displayName));
  const rival = comp.competitors.find((c) => !isMexico(c.team.displayName));
  const statusName = comp.status.type.name;

  return {
    mxScore: parseInt(mx?.score ?? "0") || 0,
    rivalScore: parseInt(rival?.score ?? "0") || 0,
    live: statusName === "STATUS_IN_PROGRESS" || statusName === "STATUS_HALFTIME",
    finished: statusName === "STATUS_FINAL" || comp.status.type.completed
  };
}
