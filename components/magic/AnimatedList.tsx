"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * AnimatedList — los elementos entran de uno en uno.
 *
 * El escalonado es CORTO a propósito (60 ms). Con 300 ms entre elementos, una
 * lista de diez notificaciones tarda tres segundos en terminar de aparecer y el
 * usuario ya está leyendo la primera: la animación pasa de acompañar a estorbar.
 *
 * Se limita a los primeros `maxAnimated`. A partir de ahí los elementos salen
 * sin animar: en una lista larga nadie ve entrar el número treinta, pero el
 * teléfono sí paga por animarlo.
 */
export function AnimatedList({
  children,
  stepMs = 60,
  maxAnimated = 8,
  className
}: {
  children: React.ReactNode;
  stepMs?: number;
  maxAnimated?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const items = Array.isArray(children) ? children : [children];

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div className={className}>
      {items.map((child, index) => (
        <motion.div
          key={index}
          initial={index < maxAnimated ? { opacity: 0, y: 12, scale: 0.985 } : false}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1], delay: (index * stepMs) / 1000 }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
