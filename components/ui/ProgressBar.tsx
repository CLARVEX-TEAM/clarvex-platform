"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fillWidth, markerPosition, paceStatus, type PaceStatus } from "@/lib/progress-pace";
import type { Accent } from "./shared";
import { accentBg } from "./shared";

/**
 * Barra de progreso con MARCA DE RITMO opcional.
 *
 * Sin `pace` se comporta exactamente como antes: los otros veinticinco usos de
 * la app no cambian.
 *
 * Con `pace`, aparece una marca vertical donde deberías ir hoy y el color sale
 * de compararte con ELLA, no con el 100%. Antes, el día 2 de un mes de cuatro
 * semanas, un 33% salía en rojo aunque fuera por delante de lo esperado (~25%):
 * el primer día de cada mes todo el mundo estaba «mal».
 */

const PACE_FILL: Record<PaceStatus, string> = {
  cumplida: "bg-success",
  adelante: "bg-success",
  "en-ritmo": "bg-volt",
  atras: "bg-orchid",
  "sin-ritmo": "bg-volt"
};

export function ProgressBar({
  value,
  tone = "volt",
  pace = null,
  className
}: {
  value: number;
  tone?: Accent;
  /** Dónde debería ir hoy, 0–100. `null` = sin marca (comportamiento anterior). */
  pace?: number | null;
  className?: string;
}) {
  const width = fillWidth(value, pace);
  const marker = markerPosition(value, pace);
  // Con marca manda el ritmo; sin ella, el tono que pida quien la usa.
  const fillClass = pace === null || pace === undefined
    ? accentBg[tone]
    : PACE_FILL[paceStatus(value, pace)];

  return (
    <div className={cn("relative mt-2 h-1.5 rounded-full bg-line", className)}>
      <div className="h-full overflow-hidden rounded-full">
        <motion.div
          className={cn("h-full rounded-full", fillClass)}
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {marker !== null ? (
        // Sobresale por arriba y por abajo del carril: dentro se confundiría
        // con el propio relleno.
        <span
          className="pointer-events-none absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink/45"
          style={{ left: `${marker}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
