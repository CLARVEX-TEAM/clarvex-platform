"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Trash2, Plus, Radio, CheckCircle2, Link2, Link2Off, Loader2, Tv } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { Card } from "@/components/ui";
import type { SerializedMatch } from "@/lib/match";

// Administración de partidos del Mundial. Compartida entre la página móvil
// (/partido) y la de escritorio (/escritorio/partido).

type ApiFixtureResult = { id: number; home: string; away: string; homeFlag: string; awayFlag: string; competition: string; statusName: string; involvesMexico: boolean };

export function PartidoAdminView({ desktop = false }: { desktop?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [matches, setMatches] = useState<SerializedMatch[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ homeTeam: "", homeFlag: "", opponent: "", opponentFlag: "", competition: "", kickoff: "" });
  const [error, setError] = useState("");
  // id del partido cuyo panel de búsqueda está abierto
  const [linking, setLinking] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ApiFixtureResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  // id del partido cuyo enlace de transmisión se está editando
  const [streamEditing, setStreamEditing] = useState<string | null>(null);
  const [streamDraft, setStreamDraft] = useState("");
  const [streamError, setStreamError] = useState("");
  const [streamSaving, setStreamSaving] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      if (s.role === "ASESOR") { router.replace("/advisor"); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/match", { cache: "no-store" }).then((r) => r.json() as Promise<{ matches?: SerializedMatch[]; canManage?: boolean }>);
    setMatches(res.matches ?? []);
    setCanManage(res.canManage === true || session?.platformAdmin === true);
  }, [session?.platformAdmin]);

  useEffect(() => {
    if (!session) return;
    load().finally(() => setLoading(false));
  }, [session, load]);

  async function createMatch() {
    setError("");
    if (!form.opponent.trim()) { setError("Indica el rival."); return; }
    if (!form.kickoff) { setError("Indica la fecha y hora."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeTeam: form.homeTeam.trim() || undefined,
          homeFlag: form.homeFlag.trim() || undefined,
          opponent: form.opponent.trim(),
          opponentFlag: form.opponentFlag.trim() || undefined,
          competition: form.competition.trim() || undefined,
          kickoff: new Date(form.kickoff).toISOString()
        })
      });
      const data = (await res.json()) as { match?: SerializedMatch; error?: string };
      if (data.error) { setError(data.error); return; }
      setForm({ homeTeam: "", homeFlag: "", opponent: "", opponentFlag: "", competition: "", kickoff: "" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/match/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este partido?")) return;
    await fetch(`/api/match/${id}`, { method: "DELETE" });
    await load();
  }

  async function openLink(match: SerializedMatch) {
    const dateIso = match.kickoff.slice(0, 10);
    setLinking(match.id);
    setSearchResults([]);
    setSearchError("");
    setSearching(true);
    try {
      const res = await fetch(`/api/match/search?date=${dateIso}`, { cache: "no-store" });
      const data = (await res.json()) as { fixtures?: ApiFixtureResult[]; error?: string };
      if (data.error) { setSearchError(data.error); return; }
      const fixtures = (data.fixtures ?? []) as ApiFixtureResult[];
      setSearchResults(fixtures);
      if (fixtures.length === 0) setSearchError("No se encontraron partidos en esa fecha.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Error desconocido al buscar.");
    } finally {
      setSearching(false);
    }
  }

  async function linkFixture(matchId: string, fixture: ApiFixtureResult) {
    // Con México en la cancha se conserva el modo tricolor (homeTeam null y el
    // rival como opponent); en cualquier otro cruce se fijan ambos equipos
    // desde ESPN para que el marcador automático mapee local/visitante.
    const isMx = (name: string) => name.toLowerCase().includes("mexico") || name.toLowerCase().includes("méxico");
    const payload = fixture.involvesMexico
      ? {
          externalId: fixture.id,
          homeTeam: null,
          opponent: isMx(fixture.home) ? fixture.away : fixture.home,
          opponentFlag: isMx(fixture.home) ? fixture.awayFlag : fixture.homeFlag
        }
      : {
          externalId: fixture.id,
          homeTeam: fixture.home,
          homeFlag: fixture.homeFlag,
          opponent: fixture.away,
          opponentFlag: fixture.awayFlag
        };
    await fetch(`/api/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setLinking(null);
    await load();
  }

  async function unlinkFixture(matchId: string) {
    await fetch(`/api/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: null })
    });
    await load();
  }

  async function saveStreamUrl(matchId: string) {
    setStreamError("");
    setStreamSaving(true);
    try {
      const res = await fetch(`/api/match/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamUrl: streamDraft.trim() || null })
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) { setStreamError(data.error); return; }
      setStreamEditing(null);
      await load();
    } finally {
      setStreamSaving(false);
    }
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }

  const statusBadge: Record<string, { label: string; cls: string }> = {
    SCHEDULED: { label: "Programado", cls: "bg-blue-500/15 text-blue-500" },
    LIVE: { label: "En vivo", cls: "bg-green-500/15 text-green-500" },
    FINISHED: { label: "Finalizado", cls: "bg-slate-500/15 text-muted" }
  };

  return (
    <div className={desktop ? "mx-auto max-w-2xl" : undefined}>
        {canManage ? (
        <Card className="mb-3 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="text-green-600" size={18} />
            <h2 className="text-base font-semibold">Programar partido</h2>
          </div>
          <div className="grid gap-2.5">
            <div className="flex gap-2">
              <input
                value={form.homeFlag}
                onChange={(e) => setForm((f) => ({ ...f, homeFlag: e.target.value }))}
                placeholder="🏴"
                className="w-16 rounded-2xl border border-line bg-panel px-3 py-2.5 text-center text-lg outline-none focus:border-volt"
              />
              <input
                value={form.homeTeam}
                onChange={(e) => setForm((f) => ({ ...f, homeTeam: e.target.value }))}
                placeholder="Equipo local (vacío = México 🇲🇽)"
                className="flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={form.opponentFlag}
                onChange={(e) => setForm((f) => ({ ...f, opponentFlag: e.target.value }))}
                placeholder="🇺🇸"
                className="w-16 rounded-2xl border border-line bg-panel px-3 py-2.5 text-center text-lg outline-none focus:border-volt"
              />
              <input
                value={form.opponent}
                onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
                placeholder="Rival (ej. Inglaterra)"
                className="flex-1 rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
              />
            </div>
            <input
              value={form.competition}
              onChange={(e) => setForm((f) => ({ ...f, competition: e.target.value }))}
              placeholder="Competición (opcional: Amistoso, Copa Oro…)"
              className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
            />
            <input
              type="datetime-local"
              value={form.kickoff}
              onChange={(e) => setForm((f) => ({ ...f, kickoff: e.target.value }))}
              className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
            />
            {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
            <button
              type="button"
              onClick={createMatch}
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
            >
              <Plus size={17} /> {saving ? "Guardando…" : "Programar partido"}
            </button>
          </div>
        </Card>
        ) : (
          <Card className="mb-3 p-4">
            <p className="text-sm text-muted">
              Solo un administrador de plataforma puede programar o editar partidos (evento global).
            </p>
          </Card>
        )}

        {/* Lista */}
        {loading ? (
          <p className="py-6 text-center text-sm text-muted">Cargando…</p>
        ) : matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No hay partidos programados.</p>
        ) : (
          <div className="grid gap-2">
            {matches.map((m) => {
              const badge = statusBadge[m.status] ?? statusBadge.SCHEDULED;
              const isLinking = linking === m.id;
              return (
                <Card key={m.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{m.homeTeam ? `${m.homeFlag ?? "🏆"} ${m.homeTeam}` : "🇲🇽 México"} 🆚 {m.opponentFlag ?? ""} {m.opponent}</p>
                      <p className="text-xs text-muted">{fmt(m.kickoff)}{m.competition ? ` · ${m.competition}` : ""}</p>
                      {m.status !== "SCHEDULED" && (
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-green-600">{m.mxScore} - {m.rivalScore}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  </div>

                  {canManage && m.externalId ? (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
                        <Link2 size={12} /> Goles automáticos activos (ID {m.externalId})
                      </span>
                      <button
                        type="button"
                        onClick={() => void unlinkFixture(m.id)}
                        className="ml-auto flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-bold text-muted transition active:scale-95"
                      >
                        <Link2Off size={11} /> Desvincular
                      </button>
                    </div>
                  ) : canManage && m.status !== "FINISHED" ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => isLinking ? setLinking(null) : void openLink(m)}
                        className="flex items-center gap-1 rounded-full bg-green-500/10 px-3 py-1 text-[11px] font-bold text-green-700 transition active:scale-95 dark:text-green-400"
                      >
                        {searching && isLinking
                          ? <><Loader2 size={11} className="animate-spin" /> Buscando…</>
                          : <><Link2 size={11} /> {isLinking ? "Cerrar" : "Activar goles automáticos"}</>
                        }
                      </button>

                      {isLinking && !searching && (
                        <div className="mt-2 grid gap-1.5">
                          {searchError && <p className="text-xs text-red-500">{searchError}</p>}
                          {searchResults.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => void linkFixture(m.id, f)}
                              className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-2 text-left transition active:scale-95"
                            >
                              <div>
                                <p className="text-xs font-semibold text-ink">{f.homeFlag || "🏆"} {f.home} vs {f.awayFlag} {f.away}</p>
                                <p className="text-[11px] text-muted">{f.competition}</p>
                              </div>
                              <span className="text-[11px] font-bold text-green-600">Vincular →</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {canManage && m.status !== "FINISHED" && (
                    <div className="mt-2">
                      {streamEditing === m.id ? (
                        <div className="grid gap-1.5">
                          <input
                            value={streamDraft}
                            onChange={(e) => setStreamDraft(e.target.value)}
                            placeholder="https://… enlace de la transmisión"
                            inputMode="url"
                            className="rounded-2xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink outline-none focus:border-volt"
                          />
                          {streamError && <p className="text-xs text-red-500">{streamError}</p>}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void saveStreamUrl(m.id)}
                              disabled={streamSaving}
                              className="flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-[11px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
                            >
                              {streamSaving ? "Guardando…" : "Guardar enlace"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setStreamEditing(null); setStreamError(""); }}
                              className="rounded-full bg-slate-500/10 px-3 py-1 text-[11px] font-bold text-muted transition active:scale-95"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={`flex min-w-0 items-center gap-1 text-[11px] font-semibold ${m.streamUrl ? "text-green-600" : "text-muted"}`}>
                            <Tv size={12} className="shrink-0" />
                            {m.streamUrl ? <span className="truncate">Transmisión configurada</span> : "Sin enlace de transmisión"}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setStreamEditing(m.id); setStreamDraft(m.streamUrl ?? ""); setStreamError(""); }}
                            className="ml-auto shrink-0 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 transition active:scale-95 dark:text-blue-400"
                          >
                            {m.streamUrl ? "Cambiar" : "Agregar"}
                          </button>
                          {m.streamUrl && (
                            <button
                              type="button"
                              onClick={() => { setStreamDraft(""); setStreamEditing(null); void fetch(`/api/match/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ streamUrl: null }) }).then(() => load()); }}
                              className="shrink-0 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-[11px] font-bold text-muted transition active:scale-95"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {canManage ? (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    {m.status === "SCHEDULED" && (
                      <button type="button" onClick={() => void setStatus(m.id, "LIVE")} className="flex items-center gap-1 rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-600 transition active:scale-95">
                        <Radio size={13} /> Iniciar
                      </button>
                    )}
                    {m.status === "LIVE" && (
                      <button type="button" onClick={() => void setStatus(m.id, "FINISHED")} className="flex items-center gap-1 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-bold text-muted transition active:scale-95">
                        <CheckCircle2 size={13} /> Finalizar
                      </button>
                    )}
                    <button type="button" onClick={() => void remove(m.id)} className="ml-auto flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-500 transition active:scale-95">
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
