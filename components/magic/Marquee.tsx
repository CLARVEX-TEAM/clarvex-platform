"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Marquee horizontal continuo, inspirado en Magic UI.
 *
 * El contenido se duplica para cerrar el ciclo sin saltos. Con movimiento
 * reducido se pinta una sola vez y deja que el contenedor decida cómo
 * acomodarlo; así el dato nunca depende de esperar una animación.
 */
export function Marquee({
  children,
  className,
  contentClassName,
  durationSec = 24
}: {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  durationSec?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={cn("overflow-hidden", className)}>
        <div className={cn("flex min-w-max items-center", contentClassName)}>{children}</div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden", className)}>
      <motion.div
        className="flex w-max will-change-transform"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: durationSec, repeat: Infinity, ease: "linear" }}
      >
        <div className={cn("flex shrink-0 items-center", contentClassName)}>{children}</div>
        <div aria-hidden="true" className={cn("flex shrink-0 items-center", contentClassName)}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
