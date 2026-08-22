"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Línea divisora con un haz de luz viajando, estilo Animated Beam. */
export function AnimatedBeam({
  className,
  durationSec = 2.8,
  repeatDelaySec = 1.4
}: {
  className?: string;
  durationSec?: number;
  repeatDelaySec?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className={cn("relative h-px overflow-hidden bg-white/25", className)}>
      {reduceMotion ? null : (
        <motion.span
          className="absolute inset-y-0 left-0 w-1/3 will-change-transform"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgb(255 255 255 / 0.95), transparent)"
          }}
          initial={{ x: "-110%" }}
          animate={{ x: "410%" }}
          transition={{
            duration: durationSec,
            repeat: Infinity,
            repeatDelay: repeatDelaySec,
            ease: [0.4, 0, 0.2, 1]
          }}
        />
      )}
    </div>
  );
}
