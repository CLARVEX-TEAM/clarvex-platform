"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * ShineBorder — el borde entero recorre un gradiente en bucle.
 *
 * Más insistente que BorderBeam: aquel es un punto de luz que da vueltas y
 * marca jerarquía; este tiñe el contorno completo y pide atención. Sirve para
 * lo que está SIN ATENDER (comunicados sin leer, un pendiente vencido), no
 * para "esto es importante".
 *
 * Misma técnica de anillo con padding que BorderBeam, para que el grosor sea
 * visible en móvil. El hijo debe traer fondo opaco.
 */
export function ShineBorder({
  children,
  className,
  radius = "rounded-[18px]",
  ringPx = 2,
  durationSec = 3.5,
  tone = "volt",
  active = true
}: {
  children: React.ReactNode;
  className?: string;
  radius?: string;
  ringPx?: number;
  durationSec?: number;
  /** `volt` para informativo, `ember` para algo que lleva tiempo esperando. */
  tone?: "volt" | "ember";
  active?: boolean;
}) {
  const reduce = useReducedMotion();

  if (!active || reduce) return <>{children}</>;

  const stops =
    tone === "ember"
      ? "rgb(217 119 6 / 0.15), rgb(217 119 6), rgb(251 191 36), rgb(217 119 6 / 0.15)"
      : "rgb(37 99 235 / 0.15), rgb(37 99 235), rgb(147 187 255), rgb(37 99 235 / 0.15)";

  return (
    <div
      className={cn("relative isolate", radius, className)}
      style={{
        padding: ringPx,
        backgroundImage: `linear-gradient(110deg, ${stops})`,
        backgroundSize: "200% 100%",
        animation: `shine-border ${durationSec}s linear infinite`
      }}
    >
      <div className="relative">{children}</div>
    </div>
  );
}
