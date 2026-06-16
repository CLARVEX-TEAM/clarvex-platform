"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const COLORS = ["#2563EB", "#22C55E", "#F59E0B", "#EF4444", "#A855F7", "#06B6D4"];

// Ráfaga de confetti que cae desde arriba y se desvanece. Sin dependencias.
export function Confetti({ show, pieces = 80, duration = 2200 }: { show: boolean; pieces?: number; duration?: number }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!show) return;
    setActive(true);
    const id = setTimeout(() => setActive(false), duration);
    return () => clearTimeout(id);
  }, [show, duration]);

  const confetti = Array.from({ length: pieces }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const drift = (Math.random() - 0.5) * 120;
    const rotate = Math.random() * 720 - 360;
    const size = 6 + Math.random() * 6;
    const color = COLORS[i % COLORS.length];
    return { id: i, left, delay, drift, rotate, size, color };
  });

  return (
    <AnimatePresence>
      {active ? (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              initial={{ y: -40, x: 0, opacity: 1, rotate: 0 }}
              animate={{ y: "105vh", x: c.drift, opacity: [1, 1, 0], rotate: c.rotate }}
              transition={{ duration: 1.6 + Math.random() * 0.8, delay: c.delay, ease: [0.2, 0.6, 0.4, 1] }}
              style={{ position: "absolute", top: 0, left: `${c.left}%`, width: c.size, height: c.size * 1.6, backgroundColor: c.color, borderRadius: 2 }}
            />
          ))}
        </div>
      ) : null}
    </AnimatePresence>
  );
}
