"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Activity } from "@/lib/types";

export function TaskItem({ activity, onToggle }: { activity: Activity; onToggle?: (completed: boolean) => void }) {
  const reduce = useReducedMotion();
  const [burst, setBurst] = useState(false);

  function handleClick() {
    const next = !activity.completed;
    if (next && !reduce) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 650);
    }
    onToggle?.(next);
  }

  return (
    <motion.button
      whileTap={{ scale: 0.985, y: 1 }}
      onClick={handleClick}
      className="flex min-h-11 w-full items-center gap-3 border-b border-line px-1 py-2 text-left transition last:border-b-0 hover:text-volt"
    >
      <span className="relative grid size-7 shrink-0 place-items-center">
        {/* Ráfaga de chispas al completar */}
        <AnimatePresence>
          {burst
            ? Array.from({ length: 6 }).map((_, i) => {
                const angle = (i / 6) * Math.PI * 2;
                return (
                  <motion.span
                    key={i}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: Math.cos(angle) * 16, y: Math.sin(angle) * 16, scale: [0, 1, 0], opacity: [1, 1, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                    className="absolute size-1.5 rounded-full bg-volt"
                  />
                );
              })
            : null}
        </AnimatePresence>
        <motion.span
          animate={burst ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "grid size-7 place-items-center rounded-[10px] border transition",
            activity.completed ? "border-volt bg-volt/20 text-volt" : "border-line text-transparent"
          )}
        >
          {activity.completed ? (
            <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 26 }}>
              <Check size={17} />
            </motion.span>
          ) : (
            <Check size={17} />
          )}
        </motion.span>
      </span>
      <span className={cn("text-sm font-semibold", activity.completed ? "text-muted line-through" : "text-ink/90")}>{activity.title}</span>
    </motion.button>
  );
}
