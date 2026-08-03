"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";

/**
 * AnimatedFingerprint — la huella se "redibuja" trazo a trazo.
 *
 * Portado de `@animate-ui/icons-fingerprint`. El icono original depende de una
 * base compartida (`@animate-ui/icons-icon`, 656 líneas: contexto de
 * animación, wrapper, disparadores por hover/tap, sistema de variantes) que
 * aquí no se usaría para nada más. La animación en sí son dos cosas: el grupo
 * late de 1 a 1.1 y cada trazo recorre `pathLength` de 1 a 0.05 y vuelve.
 * Eso es lo que está portado; los nueve `d` son los mismos del original.
 *
 * `animate` deja al llamador decidir cuándo late — durante el reto WebAuthn,
 * por ejemplo. En reposo se queda quieta, y con `prefers-reduced-motion` no se
 * mueve nunca.
 */

const PATHS = [
  "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
  "M14 13.12c0 2.38 0 6.38-1 8.88",
  "M17.29 21.02c.12-.6.43-2.3.5-3.02",
  "M2 12a10 10 0 0 1 18-6",
  "M2 16h.01",
  "M21.8 16c.2-2 .131-5.354 0-6",
  "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
  "M8.65 22c.21-.66.45-1.32.57-2",
  "M9 6.8a6 6 0 0 1 9 5.2v2"
] as const;

const groupVariants: Variants = {
  initial: { scale: 1 },
  animate: { scale: [1, 1.1, 1], transition: { ease: "easeInOut", duration: 1.5, repeat: Infinity } }
};

const pathVariants: Variants = {
  initial: { pathLength: 1 },
  animate: {
    pathLength: [1, 0.05, 1],
    transition: { duration: 1.5, ease: "easeInOut", repeat: Infinity }
  }
};

export function AnimatedFingerprint({
  size = 19,
  animate = false,
  className
}: {
  size?: number;
  /** Late y se redibuja mientras sea `true`. */
  animate?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const state = animate && !reduce ? "animate" : "initial";

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      variants={groupVariants}
      initial="initial"
      animate={state}
    >
      {PATHS.map((d) => (
        <motion.path key={d} d={d} variants={pathVariants} initial="initial" animate={state} />
      ))}
    </motion.svg>
  );
}
