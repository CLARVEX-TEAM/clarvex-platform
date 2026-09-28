"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const COLORS = ["#2563EB", "#22C55E", "#F59E0B", "#EF4444", "#A855F7", "#06B6D4"];
type Shape = "rect" | "circle" | "strip";
const SHAPES: Shape[] = ["rect", "circle", "strip"];

// Ráfaga de confetti con formas variadas, giro 3D y caída con física natural.
// Sin dependencias. Respeta prefers-reduced-motion (no se muestra).
export function Confetti({ show, pieces = 90, duration = 2600 }: { show: boolean; pieces?: number; duration?: number }) {
  const [active, setActive] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!show || reduce) return;
    setActive(true);
    const id = setTimeout(() => setActive(false), duration);
    return () => clearTimeout(id);
  }, [show, duration, reduce]);

  // Se recalcula sólo cuando cambia la cantidad de piezas (estable entre renders).
  const confetti = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const shape = SHAPES[i % SHAPES.length];
        const size = 6 + Math.random() * 7;
        return {
          id: i,
          shape,
          // arranca cerca del centro-superior para simular un "estallido"
          left: 12 + Math.random() * 76,
          delay: Math.random() * 0.35,
          drift: (Math.random() - 0.5) * 220,
          rise: 40 + Math.random() * 120, // impulso inicial hacia arriba
          spin: Math.random() * 900 - 450,
          fall: 1.7 + Math.random() * 1.1,
          width: shape === "strip" ? size * 0.5 : size,
          height: shape === "strip" ? size * 2.4 : shape === "circle" ? size : size * 1.5,
          color: COLORS[i % COLORS.length]
        };
      }),
    [pieces]
  );

  return (
    <AnimatePresence>
      {active ? (
        <div className="pointer-events-none fixed inset-0 z-60 overflow-hidden" aria-hidden>
          {confetti.map((c) => (
            <motion.span
              key={c.id}
              initial={{ top: "32%", x: 0, opacity: 1, rotate: 0, scaleX: 1 }}
              animate={{
                // sube por el impulso y luego cae más allá del borde inferior
                top: ["32%", `${32 - c.rise / 8}%`, "108%"],
                x: [0, c.drift * 0.5, c.drift],
                opacity: [1, 1, 0],
                rotate: c.spin,
                scaleX: [1, -1, 1]
              }}
              transition={{
                duration: c.fall,
                delay: c.delay,
                ease: [0.18, 0.7, 0.35, 1],
                times: [0, 0.22, 1]
              }}
              style={{
                position: "absolute",
                left: `${c.left}%`,
                width: c.width,
                height: c.height,
                backgroundColor: c.color,
                borderRadius: c.shape === "circle" ? "50%" : 2,
                boxShadow: "0 1px 2px rgb(15 23 42 / 0.12)"
              }}
            />
          ))}
        </div>
      ) : null}
    </AnimatePresence>
  );
}
