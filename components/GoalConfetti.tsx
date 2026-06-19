"use client";

import { useEffect, useState } from "react";

const EMOJIS = ["🇲🇽", "⚽", "🎉", "💚", "🤍", "❤️", "✨", "🏆"];

type Particle = { id: number; left: number; delay: number; dur: number; emoji: string; size: number };

// Lluvia de confeti tricolor que se dispara cada vez que `trigger` cambia (> 0).
export function GoalConfetti({ trigger }: { trigger: number }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (trigger <= 0) return;
    const items: Particle[] = Array.from({ length: 70 }, (_, i) => ({
      id: trigger * 1000 + i,
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      dur: 2.2 + Math.random() * 1.8,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      size: 16 + Math.random() * 26
    }));
    setParticles(items);
    const t = setTimeout(() => setParticles([]), 4500);
    return () => clearTimeout(t);
  }, [trigger]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            fontSize: `${p.size}px`,
            animation: `goalDrop ${p.dur}s linear ${p.delay}s forwards`
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
