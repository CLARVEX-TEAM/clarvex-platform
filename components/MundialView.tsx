"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui";
import type { BracketMatch, BracketTeam } from "@/lib/football-api";

// Cuadro de la fase final del Mundial. Compartido entre la página móvil
// (/mundial) y la de escritorio (/escritorio/mundial).

type BracketRound = { name: string; matches: BracketMatch[] };

function kickoffLabel(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City"
  });
}

function isLiveStatus(statusName: string) {
  return statusName === "STATUS_IN_PROGRESS" || statusName === "STATUS_HALFTIME";
}

export function MundialView({ desktop = false }: { desktop?: boolean }) {
  const [rounds, setRounds] = useState<BracketRound[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/mundial", { cache: "no-store" });
        const data = (await res.json()) as { rounds?: BracketRound[]; error?: string };
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setError("");
        setRounds(data.rounds ?? []);
      } catch {
        if (!cancelled) setError((previous) => previous || "No se pudo cargar el cuadro. Intenta de nuevo.");
      }
    };
    void load();
    // El marcador en vivo del cuadro se refresca solo.
    const interval = setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // La ronda en curso primero: la más próxima con partidos sin terminar.
  const initialRound = useMemo(() => {
    if (!rounds) return 0;
    const index = rounds.findIndex((round) => round.matches.some((match) => match.statusName !== "STATUS_FINAL"));
    return index >= 0 ? index : Math.max(0, rounds.length - 1);
  }, [rounds]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const shownRound = activeRound ?? initialRound;

  return (
    <div className={desktop ? "mx-auto max-w-4xl" : undefined}>
      {/* Hero FIFA */}
      <Card className="mb-3 overflow-hidden border-0 bg-gradient-to-br from-[#1a1f71] to-[#3c2f9e] p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-2xl">🏆</span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">Copa del Mundo FIFA 2026</p>
            <p className="text-lg font-black leading-tight">Camino a la final</p>
          </div>
        </div>
        <span className="mt-3 block h-[3px] rounded-full bg-gradient-to-r from-[#26d0ce] via-white/80 to-[#b03fd9] opacity-80" />
      </Card>

      {error && !rounds ? (
        <Card className="p-4 text-sm font-semibold text-rose-600">{error}</Card>
      ) : !rounds ? (
        <p className="py-8 text-center text-sm font-bold text-muted">Cargando cuadro…</p>
      ) : rounds.length === 0 ? (
        <p className="py-8 text-center text-sm font-bold text-muted">Aún no hay partidos de la fase final.</p>
      ) : (
        <>
          {/* Selector de ronda */}
          <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
            {rounds.map((round, index) => (
              <button
                key={round.name}
                type="button"
                onClick={() => setActiveRound(index)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-black transition active:scale-95 ${
                  index === shownRound
                    ? "bg-gradient-to-r from-[#1a1f71] to-[#4557d2] text-white shadow-[0_6px_16px_rgb(26_31_113_/_0.35)]"
                    : "bg-panel text-muted border border-line"
                }`}
              >
                {round.name}
              </button>
            ))}
          </div>

          {/* Partidos de la ronda: en escritorio caben 2 columnas */}
          <div className={`grid gap-2 ${desktop ? "md:grid-cols-2" : ""}`}>
            {rounds[shownRound]?.matches.map((match) => <MatchCard key={match.id} match={match} />)}
          </div>
        </>
      )}
    </div>
  );
}

function TeamRow({ team, other, finished }: { team: BracketTeam | null; other: BracketTeam | null; finished: boolean }) {
  const loser = finished && team && other && !team.winner && (other.winner || (other.score ?? 0) > (team.score ?? 0));
  return (
    <div className={`flex items-center gap-2.5 ${loser ? "opacity-45" : ""}`}>
      {/* Bandera emoji propia: los escudos remotos de ESPN los bloquean
          algunos navegadores (Brave, ad-blockers). */}
      {team?.flag ? (
        <span className="w-[26px] shrink-0 text-center text-lg leading-none">{team.flag}</span>
      ) : team?.logo ? (
        <Image src={team.logo} alt="" width={22} height={22} unoptimized className="size-[22px] shrink-0 rounded-full object-contain" />
      ) : (
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-slate-500/15 text-[11px]">⚽</span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-black text-ink">
        {team?.name ?? "Por definir"}
      </span>
      <span className={`shrink-0 text-sm font-black tabular-nums ${team?.winner ? "text-emerald-500" : "text-ink"}`}>
        {team?.score ?? "–"}
      </span>
    </div>
  );
}

function MatchCard({ match }: { match: BracketMatch }) {
  const live = isLiveStatus(match.statusName);
  const finished = match.statusName === "STATUS_FINAL";
  return (
    <Card className={`p-3.5 ${live ? "border border-red-400/40" : ""}`}>
      <div className="grid gap-2">
        <TeamRow team={match.home} other={match.away} finished={finished} />
        <TeamRow team={match.away} other={match.home} finished={finished} />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2 text-[11px] font-bold">
        {live ? (
          <>
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-red-500">En vivo · {match.detail}</span>
          </>
        ) : finished ? (
          <span className="text-muted">Final</span>
        ) : (
          <span className="capitalize text-muted">{kickoffLabel(match.kickoff)}</span>
        )}
      </div>
    </Card>
  );
}
