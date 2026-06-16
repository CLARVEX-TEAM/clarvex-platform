"use client";

import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type KpiColor = "blue" | "green" | "purple" | "red";

export interface KpiCardData {
  label: string;
  value: string;
  detail: string;
  progress?: number;
  /** Serie diaria (últimos días) para la mini-gráfica de tendencia. */
  trend?: number[];
  icon: LucideIcon;
  color: KpiColor;
}

const colorMap: Record<KpiColor, { icon: string; value: string; bar: string; stroke: string }> = {
  blue: {
    icon: "bg-blue-50 dark:bg-blue-950/50 text-[#2563EB]",
    value: "text-[#2563EB]",
    bar: "bg-[#2563EB]",
    stroke: "#2563EB"
  },
  green: {
    icon: "bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-500",
    value: "text-green-600 dark:text-green-500",
    bar: "bg-green-500",
    stroke: "#22C55E"
  },
  purple: {
    icon: "bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400",
    value: "text-purple-600 dark:text-purple-400",
    bar: "bg-purple-500",
    stroke: "#A855F7"
  },
  red: {
    icon: "bg-red-50 dark:bg-red-950/50 text-red-500",
    value: "text-red-500",
    bar: "bg-red-400",
    stroke: "#EF4444"
  }
};

function Sparkline({ data, color }: { data: number[]; color: KpiColor }) {
  const stroke = colorMap[color].stroke;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="mt-2 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.32} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} fill={`url(#spark-${color})`} dot={false} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const containerVariants = {
  hidden: {},
  show: (delay: number) => ({ transition: { staggerChildren: 0.08, delayChildren: delay } })
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] }
  }
};

interface QuickKpiGridProps {
  cards: KpiCardData[];
  delay?: number;
}

export function QuickKpiGrid({ cards, delay = 0.16 }: QuickKpiGridProps) {
  return (
    <motion.div
      variants={containerVariants}
      custom={delay}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3"
    >
      {cards.map((card) => {
        const colors = colorMap[card.color];
        return (
          <motion.div
            key={card.label}
            variants={itemVariants}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02, y: -2, boxShadow: "0 8px 30px rgba(37,99,235,0.15)" }}
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
            {card.trend && card.trend.length >= 2 ? (
              <Sparkline data={card.trend} color={card.color} />
            ) : card.progress !== undefined ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <motion.div
                  className={cn("h-full rounded-full", colors.bar)}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                />
              </div>
            ) : null}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
