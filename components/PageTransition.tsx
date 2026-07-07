"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  // Sin AnimatePresence mode="wait": ese modo esperaba a que la pantalla anterior
  // "saliera" antes de montar la nueva, y a veces se quedaba atorado en opacidad 0
  // (pantalla en blanco hasta refrescar). Ahora la nueva página monta de inmediato
  // con un fundido de entrada; el key por ruta fuerza el re-montaje al navegar.
  // Sólo opacity + y: NO usar filter/scale aquí (crean un containing block que
  // rompe el position:fixed de la barra de navegación).
  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
