"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Trash2, Plus, Radio, CheckCircle2, Link2, Link2Off, Loader2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, BottomNav, Card } from "@/components/ui";
import type { SerializedMatch } from "@/lib/match";

type ApiFixtureResult = { externalId: number; rival: string; competition: string; status: string };

export default function PartidoPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [matches, setMatches] = useState<SerializedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ opponent: "", opponentFlag: "", competition: "", kickoff: "" });
  const [error, setError] = useState("");
  // id del partido cuyo panel de búsqueda está abierto
  const [linking, setLinking] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ApiFixtureResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getSession().then((s) => {
      if (!s) { router.replace("/login"); return; }
      if (s.role === "ASESOR") { router.replace("/advisor"); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/match", { cache: "no-store" }).then((r) => r.json() as Promise<{ matches?: SerializedMatch[] }>);
    setMatches(res.matches ?? []);
  }, []);

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
          opponent: form.opponent.trim(),
          opponentFlag: form.opponentFlag.trim() || undefined,
          competition: form.competition.trim() || undefined,
          kickoff: new Date(form.kickoff).toISOString()
        })
      });
      const data = (await res.json()) as { match?: SerializedMatch; error?: string };
      if (data.error) { setError(data.error); return; }
      setForm({ opponent: "", opponentFlag: "", competition: "", kickoff: "" });
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
      setSearchResults(data.fixtures ?? []);
      if ((data.fixtures ?? []).length === 0) setSearchError("No se encontraron partidos de México en esa fecha.");
    } catch {
      setSearchError("Error al conectar. Verifica que FOOTBALL_API_KEY esté configurado.");
    } finally {
      setSearching(false);
    }
  }

  async function linkFixture(matchId: string, externalId: number) {
    await fetch(`/api/match/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId })
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

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }

  const statusBadge: Record<string, { label: string; cls: string }> = {
    SCHEDULED: { label: "Programado", cls: "bg-blue-500/15 text-blue-500" },
    LIVE: { label: "En vivo", cls: "bg-green-500/15 text-green-500" },
    FINISHED: { label: "Finalizado", cls: "bg-slate-500/15 text-muted" }
  };

  return (
    <>
      <AppHeader title="Selección Mexicana" subtitle="Programa partidos y avisa los goles" backHref="/manager" />
      <AppFrame>
        {/* Form */}
        <Card className="mb-3 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="text-green-600" size={18} />
            <h2 className="text-base font-black">Programar partido</h2>
          </div>
          <div className="grid gap-2.5">
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
                placeholder="Rival (ej. Estados Unidos)"
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
              className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-black text-white transition active:scale-95 disabled:opacity-50"
            >
              <Plus size={17} /> {saving ? "Guardando…" : "Programar partido"}
            </button>
          </div>
        </Card>

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
                      <p className="truncate text-sm font-black text-ink">🇲🇽 México 🆚 {m.opponentFlag ?? ""} {m.opponent}</p>
                      <p className="text-xs text-muted">{fmt(m.kickoff)}{m.competition ? ` · ${m.competition}` : ""}</p>
                      {m.status !== "SCHEDULED" && (
                        <p className="mt-0.5 text-sm font-black tabular-nums text-green-600">{m.mxScore} - {m.rivalScore}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                  </div>

                  {/* Estado vinculación */}
                  {m.externalId ? (
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
                  ) : m.status !== "FINISHED" ? (
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
                              key={f.externalId}
                              type="button"
                              onClick={() => void linkFixture(m.id, f.externalId)}
                              className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-2 text-left transition active:scale-95"
                            >
                              <div>
                                <p className="text-xs font-black text-ink">🇲🇽 México vs {f.rival}</p>
                                <p className="text-[11px] text-muted">{f.competition} · ID {f.externalId}</p>
                              </div>
                              <span className="text-[11px] font-bold text-green-600">Vincular →</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

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
                </Card>
              );
            })}
          </div>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}
