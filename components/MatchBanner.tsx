"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Settings, Tv } from "lucide-react";
import { GoalConfetti } from "@/components/GoalConfetti";
import { matchHome, matchPhase, type SerializedMatch } from "@/lib/match";

// El banner (y el tema tricolor que lo acompaña) solo aparecen el DÍA del
// partido en zona México — no 48 h antes.
function isMatchToday(iso: string) {
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
  return fmt(new Date(iso)) === fmt(new Date());
}

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

  // No mostrar en login, dentro de una conversación de chat (pantalla completa)
  // ni viendo el partido: /partido/ver ya trae su propio marcador arriba y el
  // banner taparía el video.
  const hidden = !pathname || pathname === "/login" || pathname.startsWith("/chat/") || pathname.startsWith("/partido/ver");
  // En el escritorio el banner no puede empujar el layout ni taparse con el
  // header: va como tarjeta flotante abajo a la derecha.
  const isDesktop = !!pathname && pathname.startsWith("/escritorio");

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
  // Solo el día del juego (o si sigue EN VIVO pasada la medianoche).
  const isToday = !!match && (isMatchToday(match.kickoff) || match.status === "LIVE");
  const visible = !hidden && !!match && phase !== "past" && isToday;

  // Tema del día de partido: tricolor si juega México, FIFA (azules) si es
  // cualquier otro cruce del Mundial.
  const isMexicoMatch = !match?.homeTeam;
  useEffect(() => {
    if (visible) {
      document.documentElement.setAttribute("data-matchday", isMexicoMatch ? "1" : "fifa");
    } else {
      document.documentElement.removeAttribute("data-matchday");
    }
    return () => { document.documentElement.removeAttribute("data-matchday"); };
  }, [visible, isMexicoMatch]);

  // Compensar la altura del banner para no tapar el encabezado de las páginas.
  // Solo en móvil: en escritorio el banner flota y no desplaza el layout.
  // --matchday-offset ancla los headers sticky DEBAJO del banner (sin la
  // variable se pegan en top:0, detrás del banner, y el scroll se encima).
  useEffect(() => {
    if (visible && !isDesktop && bannerRef.current) {
      const height = bannerRef.current.offsetHeight;
      document.body.style.paddingTop = `${height}px`;
      document.documentElement.style.setProperty("--matchday-offset", `${height}px`);
    } else {
      document.body.style.paddingTop = "";
      document.documentElement.style.removeProperty("--matchday-offset");
    }
    return () => {
      document.body.style.paddingTop = "";
      document.documentElement.style.removeProperty("--matchday-offset");
    };
  }, [visible, isDesktop, match, canManage]);

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

  // "En vivo" de verdad: por estado (sync/manual) o porque ya pasó la hora del
  // silbatazo. En la ventana previa (2 h antes) el banner presenta el duelo sin
  // marcador ni botones — evita goles fantasma antes de empezar.
  const started = match.status === "LIVE" || Date.now() >= new Date(match.kickoff).getTime();
  const isLive = phase === "live" && started;
  const minutesToKickoff = Math.max(0, Math.round((new Date(match.kickoff).getTime() - Date.now()) / 60_000));
  const countdown = minutesToKickoff > 0 && minutesToKickoff <= 120
    ? `Arranca en ${minutesToKickoff >= 60 ? `${Math.floor(minutesToKickoff / 60)} h ` : ""}${minutesToKickoff % 60} min`
    : formatKickoff(match.kickoff);
  const home = matchHome(match);
  // México: verde selección. Otro cruce del Mundial: azul FIFA.
  const bannerGradient = home.isMexico
    ? "bg-gradient-to-br from-[#0a5741] to-[#0d6a4e] shadow-[0_10px_28px_rgb(6_78_59_/_0.4)]"
    : "bg-gradient-to-br from-[#1a1f71] to-[#3c2f9e] shadow-[0_10px_28px_rgb(26_31_113_/_0.45)]";
  const accentLine = home.isMexico
    ? "bg-gradient-to-r from-[#2ea277] via-white/85 to-[#e4526b]"
    : "bg-gradient-to-r from-[#26d0ce] via-white/85 to-[#b03fd9]";

  return (
    <>
      <div
        ref={bannerRef}
        className={isDesktop
          ? "fixed bottom-6 right-6 z-[55] w-[26rem] max-w-[calc(100vw-3rem)]"
          : "fixed inset-x-0 top-0 z-[55] px-3 pb-1.5"}
        style={isDesktop ? undefined : { paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
      >
        {/* Fondo del strip (solo móvil): el contenido que pasa por detrás al
            hacer scroll se difumina en vez de verse crudo junto al pill. */}
        {!isDesktop && (
          <span className="pointer-events-none absolute inset-0 -z-10 bg-white/85 backdrop-blur-xl dark:bg-slate-950/85" />
        )}
        <div className={`relative mx-auto max-w-md overflow-hidden rounded-[22px] border border-white/15 text-white backdrop-blur-xl ${bannerGradient}`}>
          <span className={`pointer-events-none absolute inset-x-5 bottom-0 h-[2px] rounded-full opacity-80 ${accentLine}`} />
          <div className="flex flex-col gap-1 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            {isLive ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                  <span className="inline-block size-1.5 animate-pulse rounded-full bg-white" />
                  En vivo{match.competition ? ` · ${match.competition}` : ""}{match.externalId ? " · marcador automático" : ""}
                </div>
                <div className="mt-0.5 flex items-center justify-center gap-3">
                  <span className="min-w-0 truncate text-right text-sm font-black">{home.flag} {home.name}</span>
                  <motion.span
                    key={`${match.mxScore}-${match.rivalScore}`}
                    initial={{ scale: 1.45 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    className="shrink-0 rounded-lg bg-black/25 px-2.5 py-0.5 text-lg font-black leading-none tabular-nums"
                  >
                    {match.mxScore} – {match.rivalScore}
                  </motion.span>
                  <span className="min-w-0 truncate text-left text-sm font-black">{match.opponentFlag ?? ""} {match.opponent}</span>
                </div>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-lg leading-none">{home.isMexico ? "🇲🇽" : home.flag || "🏆"}</span>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider opacity-90">{countdown}{match.competition ? ` · ${match.competition}` : ""}</div>
                  <p className="truncate text-sm font-black">
                    {home.isMexico ? "¡Juega México!" : `${home.name}`} 🆚 {match.opponentFlag ?? ""} {match.opponent}
                  </p>
                </div>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {match.streamUrl && (
                <a
                  href="/partido/ver"
                  className="flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-black text-[#006847] transition hover:bg-white/90 active:scale-95"
                >
                  <Tv size={13} /> Ver partido
                </a>
              )}
              {canManage && (
                <a href={isDesktop ? "/escritorio/partido" : "/partido"} className="grid size-8 place-items-center rounded-full bg-white/15 text-white/90 transition hover:bg-white/25" aria-label="Administrar partidos">
                  <Settings size={15} />
                </a>
              )}
            </div>
          </div>

          {canManage && isLive && (
            <div className="flex items-center gap-1.5 pb-0.5">
              <div className="flex flex-1 items-center gap-1">
                <button type="button" onClick={() => goal("MX")} disabled={busy} className={`flex-1 rounded-full bg-white px-2 py-1 text-[12px] font-black transition active:scale-95 disabled:opacity-50 ${home.isMexico ? "text-[#006847]" : "text-[#1a1f71]"}`}>
                  ⚽ Gol {home.name}
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
      </div>
      <GoalConfetti trigger={confetti} />
    </>
  );
}
