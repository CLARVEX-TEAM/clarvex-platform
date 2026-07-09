"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Accent } from "./shared";
import { accentBg } from "./shared";

export function ProgressBar({ value, tone = "volt" }: { value: number; tone?: Accent }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
      <motion.div
        className={cn("h-full rounded-full", accentBg[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
