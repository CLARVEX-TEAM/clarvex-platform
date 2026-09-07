"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Pie de derechos de autor, visible al final de cada pantalla al hacer scroll.
export function AppCopyright({ className = "" }: { className?: string }) {
  return (
    <p className={cn("px-4 pt-6 text-center text-[11px] font-semibold leading-4 text-muted/70", className)}>
      © {new Date().getFullYear()} CLARVEX · Jesús Adrián Hernández Luna.<br className="sm:hidden" /> Todos los derechos reservados.
    </p>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      // El hueco de abajo tiene que crecer junto con la barra: si solo sube la
      // barra, tapa el último renglón de cada pantalla.
      className="mx-auto min-h-screen max-w-md px-4 pb-[calc(6rem+var(--safe-bottom))] pt-3"
    >
      {children}
      <AppCopyright />
    </motion.main>
  );
}
