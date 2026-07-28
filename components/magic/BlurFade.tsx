"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * BlurFade — el bloque entra desenfocado y se enfoca al llegar a su sitio.
 *
 * Sustituye a la entrada que la app ya hacía (opacidad + desplazamiento), no se
 * suma a ella: la idea es cambiar el carácter del movimiento, no añadir otra
 * capa encima.
 *
 * ⚠️ El desenfoque anima la propiedad `filter`, que es cara en GPU. Úsalo en
 * unos pocos bloques por pantalla, no en cada tarjeta de una lista larga: en un
 * Android de gama media una lista de veinte pendientes desenfocándose a la vez
 * se nota.
 */
export function BlurFade({
  children,
  delay = 0,
  blurPx = 6,
  className
}: {
  children: React.ReactNode;
  delay?: number;
  blurPx?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10, filter: `blur(${blurPx}px)` }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
