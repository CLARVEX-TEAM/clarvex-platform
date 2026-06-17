"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 88;

/**
 * Envuelve un elemento para permitir "deslizar hacia la izquierda" y disparar
 * una acción (completar, marcar leído…). Vuelve solo a su lugar al soltar.
 * Si está deshabilitado o el usuario prefiere menos movimiento, no hace nada.
 */
export function SwipeToAction({
  children,
  onAction,
  icon: Icon,
  label,
  color = "bg-success",
  disabled = false,
  className = ""
}: {
  children: React.ReactNode;
  onAction: () => void;
  icon: LucideIcon;
  label: string;
  color?: string;
  disabled?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const armed = useRef(false);

  if (disabled || reduce) return <>{children}</>;

  return (
    <div className={cn("relative overflow-hidden rounded-[28px]", className)}>
      <div className={cn("absolute inset-y-0 right-0 flex w-2/3 items-center justify-end gap-2 pr-6 text-white", color)}>
        <Icon size={18} />
        <span className="text-sm font-black">{label}</span>
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -150, right: 0 }}
        dragElastic={0.1}
        dragSnapToOrigin
        onDragStart={() => { armed.current = false; }}
        onDrag={(_, info) => {
          if (info.offset.x < -THRESHOLD && !armed.current) { armed.current = true; haptic(12); }
          if (info.offset.x > -THRESHOLD) armed.current = false;
        }}
        onDragEnd={(_, info) => { if (info.offset.x < -THRESHOLD) onAction(); }}
        className="relative touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
