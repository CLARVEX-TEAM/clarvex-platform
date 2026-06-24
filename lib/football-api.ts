const HOST = "api-football-v1.p.rapidapi.com";
const BASE = `https://${HOST}/v3`;
export const MEXICO_TEAM_ID = 262;

export type ApiFixture = {
  fixture: { id: number; status: { short: string } };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
  league: { name: string; country: string };
};

async function apiFetch(path: string): Promise<{ response: ApiFixture[] }> {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) throw new Error("FOOTBALL_API_KEY no configurado");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`api-football error ${res.status}`);
    return res.json() as Promise<{ response: ApiFixture[] }>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchMexicoFixtures(dateIso: string) {
  return apiFetch(`/fixtures?team=${MEXICO_TEAM_ID}&date=${dateIso}&timezone=America%2FMexico_City`);
}

export async function getFixture(externalId: number) {
  const data = await apiFetch(`/fixtures?id=${externalId}`);
  return data.response[0] ?? null;
}

// Devuelve { mxScore, rivalScore } determinando si México es local o visitante.
export function extractScore(fixture: ApiFixture): { mxScore: number; rivalScore: number } {
  const mxIsHome = fixture.teams.home.id === MEXICO_TEAM_ID;
  const home = fixture.goals.home ?? 0;
  const away = fixture.goals.away ?? 0;
  return mxIsHome ? { mxScore: home, rivalScore: away } : { mxScore: away, rivalScore: home };
}

// Statuses de api-football que indican partido terminado.
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);
export function isFixtureFinished(fixture: ApiFixture) {
  return FINISHED_STATUSES.has(fixture.fixture.status.short);
}
