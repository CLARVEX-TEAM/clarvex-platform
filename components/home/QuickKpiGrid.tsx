"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type KpiColor = "blue" | "green" | "purple" | "red";

export interface KpiCardData {
  label: string;
  value: string;
  detail: string;
  progress?: number;
  icon: LucideIcon;
  color: KpiColor;
}

const colorMap: Record<KpiColor, { icon: string; value: string; bar: string }> = {
  blue: {
    icon: "bg-blue-50 dark:bg-blue-950/50 text-[#2563EB]",
    value: "text-[#2563EB]",
    bar: "bg-[#2563EB]"
  },
  green: {
    icon: "bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-500",
    value: "text-green-600 dark:text-green-500",
    bar: "bg-green-500"
  },
  purple: {
    icon: "bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400",
    value: "text-purple-600 dark:text-purple-400",
    bar: "bg-purple-500"
  },
  red: {
    icon: "bg-red-50 dark:bg-red-950/50 text-red-500",
    value: "text-red-500",
    bar: "bg-red-400"
  }
};

interface QuickKpiGridProps {
  cards: KpiCardData[];
  delay?: number;
}

export function QuickKpiGrid({ cards, delay = 0.16 }: QuickKpiGridProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className="grid grid-cols-2 gap-3"
    >
      {cards.map((card, i) => {
        const colors = colorMap[card.color];
        return (
          <motion.div
            key={card.label}
            whileTap={{ scale: 0.97 }}
            className="min-h-[100px] rounded-[28px] border border-white/50 bg-white/75 p-3.5 backdrop-blur-2xl dark:border-slate-700/50 dark:bg-slate-800/60"
            style={{ boxShadow: "0 4px 20px rgba(15,23,42,0.06)" }}
          >
            <span className={cn("inline-grid size-9 place-items-center rounded-[18px]", colors.icon)}>
              <card.icon size={17} />
            </span>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
              {card.label}
            </p>
            <p className={cn("mt-0.5 text-[1.4rem] font-black leading-tight tracking-[-0.03em]", colors.value)}>
              {card.value}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-400 dark:text-slate-500">{card.detail}</p>
            {card.progress !== undefined && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <motion.div
                  className={cn("h-full rounded-full", colors.bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: delay + 0.05 + i * 0.04 }}
                />
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
