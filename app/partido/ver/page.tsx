"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Tv } from "lucide-react";
import { getSession } from "@/lib/auth";
import { matchPhase, type SerializedMatch } from "@/lib/match";
import { normalizeStreamUrl } from "@/lib/stream-url";

// Pantalla para ver el partido con el enlace que configura gerencia.
// Solo se habilita el DÍA del partido (zona México) o mientras siga EN VIVO.
function isMatchToday(iso: string) {
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
  return fmt(new Date(iso)) === fmt(new Date());
}

export default function VerPartidoPage() {
  const router = useRouter();
  const [match, setMatch] = useState<SerializedMatch | null>(null);
  const [loading, setLoading] = useState(true);
  // null = verificando; false = el sitio bloquea iframes → pantalla con botón
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const load = async () => {
      try {
        const res = await fetch("/api/match/active", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { match: SerializedMatch | null };
        if (!cancelled) setMatch(data.match);
      } catch { /* sin conexión: mantener estado */ } finally {
        if (!cancelled) setLoading(false);
      }
    };
    getSession().then((session) => {
      if (!session) { router.replace("/login"); return; }
      if (cancelled) return;
      void load();
      // Refresca el marcador del encabezado sin recargar el reproductor.
      interval = setInterval(() => { void load(); }, 20000);
    });
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [router]);

  // Verificar en el servidor si el enlace permite iframes (X-Frame-Options).
  // Si no, en vez del error gris del navegador mostramos botón para abrirlo.
  useEffect(() => {
    if (!match?.id || !match.streamUrl) return;
    let cancelled = false;
    fetch(`/api/match/stream-check?id=${match.id}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<{ embeddable?: boolean }>)
      .then((data) => { if (!cancelled) setEmbeddable(data.embeddable !== false); })
      .catch(() => { if (!cancelled) setEmbeddable(true); });
    return () => { cancelled = true; };
  }, [match?.id, match?.streamUrl]);

  const enabled = !!match
    && !!match.streamUrl
    && match.status !== "FINISHED"
    && (isMatchToday(match.kickoff) || match.status === "LIVE");
  const started = !!match && (match.status === "LIVE" || Date.now() >= new Date(match.kickoff).getTime());
  const rival = match ? `${match.opponentFlag ?? ""} ${match.opponent}`.trim() : "";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#06100a] text-white">
      {/* Barra superior */}
      <header
        className="flex items-center gap-3 border-b border-white/10 bg-[#0a1f16]/95 px-3 pb-2.5 backdrop-blur-xl"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Regresar"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 transition active:scale-95"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          {match ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-wider text-white/60">
                {match.status === "LIVE" ? "🔴 En vivo" : "Partido de hoy"}{match.competition ? ` · ${match.competition}` : ""}
              </p>
              <p className="truncate text-sm font-black">
                🇲🇽 México {started ? <span className="mx-1 rounded-md bg-white/15 px-1.5 py-0.5 tabular-nums">{match.mxScore} – {match.rivalScore}</span> : " 🆚 "} {rival}
              </p>
            </>
          ) : (
            <p className="text-sm font-black">Partido de México</p>
          )}
        </div>
        {enabled && match?.streamUrl ? (
          <a
            href={match.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir en el navegador"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 transition active:scale-95"
          >
            <ExternalLink size={16} />
          </a>
        ) : <span className="size-9 shrink-0" />}
      </header>

      {/* Contenido */}
      {loading || (enabled && embeddable === null) ? (
        <div className="grid flex-1 place-items-center text-sm font-bold text-white/60">Cargando…</div>
      ) : enabled && match?.streamUrl && embeddable === false ? (
        // El sitio de la transmisión no permite verse dentro de la app:
        // pantalla limpia con acceso directo en lugar del error del navegador.
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <span className="mb-4 mx-auto grid size-16 place-items-center rounded-3xl bg-white/10"><Tv size={30} /></span>
            <p className="text-lg font-black">La transmisión se abre fuera de la app</p>
            <p className="mt-1.5 text-sm text-white/55">
              El sitio de la transmisión no permite reproducirse aquí dentro.
              Ábrela en el navegador y regresa para seguir el marcador.
            </p>
            <a
              href={match.streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-black text-[#006847] transition active:scale-95"
            >
              <ExternalLink size={16} /> Ver transmisión
            </a>
          </div>
        </div>
      ) : enabled && match?.streamUrl ? (
        <iframe
          src={normalizeStreamUrl(match.streamUrl)}
          title={`México vs ${match.opponent}`}
          className="w-full flex-1 border-0 bg-black"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div>
            <span className="mb-4 mx-auto grid size-16 place-items-center rounded-3xl bg-white/10"><Tv size={30} /></span>
            <p className="text-lg font-black">
              {match && matchPhase(match) !== "past" && !match.streamUrl
                ? "La transmisión aún no está configurada"
                : "Disponible solo el día del partido"}
            </p>
            <p className="mt-1.5 text-sm text-white/55">
              {match && matchPhase(match) !== "past" && !match.streamUrl
                ? "Gerencia puede agregar el enlace en Partido México."
                : "Vuelve cuando juegue la Selección. 🇲🇽"}
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-6 rounded-full bg-white/15 px-7 py-2.5 text-sm font-black transition active:scale-95"
            >
              Regresar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
