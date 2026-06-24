"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { GoalConfetti } from "@/components/GoalConfetti";
import { matchPhase, type SerializedMatch } from "@/lib/match";

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `Hoy ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${time}`;
  return `${d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

export function MatchBanner() {
  const pathname = usePathname();
  const [match, setMatch] = useState<SerializedMatch | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [busy, setBusy] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const prevMx = useRef<number | null>(null);
  const matchId = useRef<string | null>(null);

  // No mostrar en login ni dentro de una conversación de chat (pantalla completa).
  const hidden = !pathname || pathname === "/login" || pathname.startsWith("/chat/");

  const refresh = useCallback(async () => {
    if (hidden) return;
    try {
      const res = await fetch("/api/match/active", { cache: "no-store" });
      if (!res.ok) { setMatch(null); return; }
      const data = (await res.json()) as { match: SerializedMatch | null; canManage: boolean };
      setCanManage(data.canManage);
      const m = data.match;
      if (m) {
        // Detectar gol de México para disparar confeti (salvo en la primera carga).
        if (matchId.current === m.id && prevMx.current !== null && m.mxScore > prevMx.current) {
          setConfetti((c) => c + 1);
        }
        matchId.current = m.id;
        prevMx.current = m.mxScore;
      } else {
        matchId.current = null;
        prevMx.current = null;
      }
      setMatch(m);
    } catch {
      /* sin conexión: mantener estado */
    }
  }, [hidden]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const phase = match ? matchPhase(match) : "past";
  const visible = !hidden && !!match && phase !== "past";

  // Compensar la altura del banner para no tapar el encabezado de las páginas.
  useEffect(() => {
    if (visible && bannerRef.current) {
      document.body.style.paddingTop = `${bannerRef.current.offsetHeight}px`;
    } else {
      document.body.style.paddingTop = "";
    }
    return () => { document.body.style.paddingTop = ""; };
  }, [visible, match, canManage]);

  if (!visible || !match) return <GoalConfetti trigger={confetti} />;

  async function act(url: string, body: object) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as { match?: SerializedMatch };
      if (data.match) { prevMx.current = data.match.mxScore; matchId.current = data.match.id; setMatch(data.match); }
    } finally {
      setBusy(false);
    }
  }

  function goal(team: "MX" | "RIVAL") {
    if (team === "MX") setConfetti((c) => c + 1); // feedback inmediato a quien marca
    void act(`/api/match/${match!.id}/goal`, { team });
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/match/${match!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINISHED" })
      });
      setMatch(null);
    } finally {
      setBusy(false);
    }
  }

  function undoGoal(team: "MX" | "RIVAL") {
    if (!match) return;
    const current = team === "MX" ? match.mxScore : match.rivalScore;
    if (current <= 0) return;
    void act(`/api/match/${match.id}`, { [team === "MX" ? "mxScore" : "rivalScore"]: current - 1 });
  }

  const isLive = phase === "live";

  return (
    <>
      <div
        ref={bannerRef}
        className="fixed inset-x-0 top-0 z-[55] bg-gradient-to-r from-[#006847] via-[#0b8a5b] to-[#ce1126] text-white shadow-lg"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-3 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-lg leading-none">🇲🇽</span>
              {isLive ? (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-white" />
                    En vivo{match.competition ? ` · ${match.competition}` : ""}
                  </div>
                  <p className="truncate text-sm font-black">
                    México <span className="tabular-nums">{match.mxScore} - {match.rivalScore}</span> {match.opponentFlag ?? ""} {match.opponent}
                  </p>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider opacity-90">{formatKickoff(match.kickoff)}{match.competition ? ` · ${match.competition}` : ""}</div>
                  <p className="truncate text-sm font-black">¡Juega México! 🆚 {match.opponentFlag ?? ""} {match.opponent}</p>
                </div>
              )}
            </div>
            {canManage && (
              <a href="/partido" className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-base transition hover:bg-white/30" aria-label="Administrar partidos">
                ⚙️
              </a>
            )}
          </div>

          {canManage && isLive && (
            <div className="flex items-center gap-1.5 pb-0.5">
              <div className="flex flex-1 items-center gap-1">
                <button type="button" onClick={() => goal("MX")} disabled={busy} className="flex-1 rounded-full bg-white px-2 py-1 text-[12px] font-black text-[#006847] transition active:scale-95 disabled:opacity-50">
                  ⚽ Gol México
                </button>
                {match.mxScore > 0 && (
                  <button type="button" onClick={() => undoGoal("MX")} disabled={busy} title="Deshacer gol México" className="grid size-6 shrink-0 place-items-center rounded-full bg-white/30 text-[11px] font-black transition active:scale-95 disabled:opacity-50">
                    −
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => goal("RIVAL")} disabled={busy} className="rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-bold transition active:scale-95 disabled:opacity-50">
                  Gol rival
                </button>
                {match.rivalScore > 0 && (
                  <button type="button" onClick={() => undoGoal("RIVAL")} disabled={busy} title="Deshacer gol rival" className="grid size-6 shrink-0 place-items-center rounded-full bg-white/30 text-[11px] font-black transition active:scale-95 disabled:opacity-50">
                    −
                  </button>
                )}
              </div>
              <button type="button" onClick={() => void finish()} disabled={busy} className="rounded-full bg-black/25 px-2.5 py-1 text-[12px] font-bold transition active:scale-95 disabled:opacity-50">
                Finalizar
              </button>
            </div>
          )}
        </div>
      </div>
      <GoalConfetti trigger={confetti} />
    </>
  );
}
