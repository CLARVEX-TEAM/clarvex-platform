"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { matchHome, type SerializedMatch } from "@/lib/match";

const INTRO_KEY = "mx-match-intro-";
const DURATION_MS = 5500;

function kickoffText(iso: string, isLive: boolean) {
  if (isLive) return "¡En vivo ahora!";
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Mexico_City"
  });
}

function isMatchToday(iso: string) {
  const fmt = (d: Date) => d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
  return fmt(new Date(iso)) === fmt(new Date());
}

type Particle = { id: number; x: number; delay: number; dur: number; emoji: string };

const EMOJIS_MX = ["🇲🇽", "⚽", "💚", "🤍", "❤️", "✨"];
const EMOJIS_FIFA = ["⚽", "🏆", "🎉", "✨", "🥅", "🌎"];

function makeParticlesFor(isMexico: boolean): Particle[] {
  const emojis = isMexico ? EMOJIS_MX : EMOJIS_FIFA;
  return Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    delay: Math.random() * 3,
    dur: 4 + Math.random() * 4,
    emoji: emojis[Math.floor(Math.random() * emojis.length)]
  }));
}

export function MatchIntro() {
  const pathname = usePathname();
  const [match, setMatch] = useState<SerializedMatch | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (pathname === "/login") return;
    void (async () => {
      try {
        const res = await fetch("/api/match/active", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { match: SerializedMatch | null };
        const m = data.match;
        if (!m || m.status === "FINISHED") return;
        if (!isMatchToday(m.kickoff)) return;
        if (sessionStorage.getItem(INTRO_KEY + m.id)) return;
        sessionStorage.setItem(INTRO_KEY + m.id, "1");
        setMatch(m);
        setShow(true);
      } catch { /* sin conexión */ }
    })();
  }, [pathname]);

  return (
    <AnimatePresence>
      {show && match && (
        <IntroOverlay match={match} onClose={() => setShow(false)} />
      )}
    </AnimatePresence>
  );
}

function IntroOverlay({ match, onClose }: { match: SerializedMatch; onClose: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [particles] = useState(() => makeParticlesFor(!match.homeTeam));
  const isLive = match.status === "LIVE";
  const rival = [match.opponentFlag, match.opponent].filter(Boolean).join(" ");
  const home = matchHome(match);
  // Paleta: verde selección para México, azules FIFA para el resto del Mundial.
  const palette = home.isMexico
    ? { bg: "#06100a", blobA: "#006847", blobB: "#CE1126", glow: "rgba(0,104,71,0.7)", title: "linear-gradient(140deg, #1fbe78 0%, #ffffff 48%, #e8354a 100%)", bar: ["#006847", "#ffffff", "#CE1126"], button: "linear-gradient(135deg, #006847, #00a060)", buttonShadow: "0 8px 28px rgba(0,104,71,0.45)", progress: "#006847" }
    : { bg: "#0a0a1f", blobA: "#1a1f71", blobB: "#7b2fbf", glow: "rgba(69,87,210,0.7)", title: "linear-gradient(140deg, #26d0ce 0%, #ffffff 48%, #b03fd9 100%)", bar: ["#26d0ce", "#4557d2", "#b03fd9"], button: "linear-gradient(135deg, #1a1f71, #4557d2)", buttonShadow: "0 8px 28px rgba(26,31,113,0.5)", progress: "#4557d2" };

  useEffect(() => {
    timerRef.current = setTimeout(onClose, DURATION_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden"
      style={{ background: palette.bg }}
      onClick={onClose}
    >
      {/* Blob superior-izquierda */}
      <div
        className="pointer-events-none absolute -left-36 -top-36 h-[28rem] w-[28rem] rounded-full opacity-50"
        style={{ background: palette.blobA, filter: "blur(90px)" }}
      />
      {/* Blob inferior-derecha */}
      <div
        className="pointer-events-none absolute -bottom-36 -right-20 h-[26rem] w-[26rem] rounded-full opacity-40"
        style={{ background: palette.blobB, filter: "blur(90px)" }}
      />
      {/* Blob blanco centro */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
        style={{ background: "#ffffff", filter: "blur(50px)" }}
      />

      {/* Partículas flotantes */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none absolute select-none text-xl leading-none"
          style={{
            left: `${p.x}%`,
            bottom: "-2rem",
            animation: `introFloat ${p.dur}s ease-in ${p.delay}s infinite`
          }}
        >
          {p.emoji}
        </span>
      ))}

      {/* Tarjeta central */}
      <motion.div
        initial={{ scale: 0.82, y: 32, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: -20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.05 }}
        className="relative z-10 flex w-full max-w-[18rem] flex-col items-center text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bandera grande */}
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.18 }}
          className="mb-5 select-none text-[72px] leading-none"
          style={{ filter: `drop-shadow(0 0 28px ${palette.glow})` }}
        >
          {home.isMexico ? "🇲🇽" : home.flag || "🏆"}
        </motion.span>

        {/* Etiqueta "hoy juega" */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="mb-1 text-[11px] font-black uppercase tracking-[0.22em] text-white/50"
        >
          {isLive ? "¡En vivo ahora!" : home.isMexico ? "Hoy juega" : "Hoy en el Mundial"}
        </motion.p>

        {/* MÉXICO — tricolor gradient text */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className={`mb-3 font-black uppercase leading-none tracking-tight ${home.isMexico ? "text-[52px]" : "text-[34px]"}`}
          style={{
            background: palette.title,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}
        >
          {home.name}
        </motion.h1>

        {/* Barra tricolor */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.42, duration: 0.55, ease: "easeOut" }}
          className="mb-4 flex h-[3px] w-28 origin-left overflow-hidden rounded-full"
        >
          <div className="flex-1" style={{ background: palette.bar[0] }} />
          <div className="flex-1" style={{ background: palette.bar[1] }} />
          <div className="flex-1" style={{ background: palette.bar[2] }} />
        </motion.div>

        {/* VS rival */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="mb-1 text-[22px] font-black text-white"
        >
          🆚 {rival}
        </motion.p>

        {/* Hora / competición */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.54 }}
          className="mb-7 text-[13px] font-semibold"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {kickoffText(match.kickoff, isLive)}
          {match.competition ? ` · ${match.competition}` : ""}
        </motion.p>

        {/* Botón */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.94 }}
          onClick={onClose}
          className="rounded-full px-9 py-3 text-sm font-black text-white"
          style={{
            background: palette.button,
            boxShadow: palette.buttonShadow
          }}
        >
          {home.isMexico ? "¡Vamos México! 💚" : "¡Que empiece! ⚽"}
        </motion.button>
      </motion.div>

      {/* Barra de progreso auto-cierre */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: DURATION_MS / 1000, ease: "linear" }}
        className="absolute inset-x-0 bottom-0 h-[3px] origin-left"
        style={{ background: palette.progress }}
      />
    </motion.div>
  );
}
