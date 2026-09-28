"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

// Card de contenido: quieta por defecto. El movimiento es feedback de estado
// (botones, toggles), no decoración; la entrada de página la da AppFrame.
// Sigue siendo motion.section para que un caller pueda animarla explícitamente.
export function GlassCard({ children, className = "", ...props }: Omit<HTMLMotionProps<"section">, "children"> & { children: React.ReactNode }) {
  return (
    <motion.section
      {...props}
      className={cn("app-card solid-card rounded-[28px] p-3.5 shadow-glass", className)}
    >
      {children}
    </motion.section>
  );
}

export const Card = GlassCard;
