"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Accent } from "./shared";
import { accentText } from "./shared";
import { AnimatedNumber } from "@/components/AnimatedNumber";

export function ProgressRing({ value, tone = "volt", size = 76 }: { value: number; tone?: Accent; size?: number }) {
  const clamped = Math.max(0, Math.min(100, value)); // el aro llena máximo 100%
  const display = Math.max(0, Math.round(value));      // el número muestra el real (puede pasar de 100%)
  const radius = 28;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative grid place-items-center rounded-full bg-volt/10 dark:bg-panel" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-line" />
        <motion.circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={cn("stroke-current", accentText[tone])}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (clamped / 100) * circumference }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className={cn("absolute font-black text-ink", display >= 1000 ? "text-[11px]" : "text-sm")}>{display}%</span>
    </div>
  );
}
