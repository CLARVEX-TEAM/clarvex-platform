"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/AnimatedNumber";
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
  /** Si se define, la tarjeta se vuelve un enlace a esta ruta. */
  href?: string;
}

// Minimalista: el valor va en tinta neutra salvo lo semántico (crítico en rojo).
// El color solo aparece cuando comunica estado.
const valueClass: Record<KpiColor, string> = {
  blue: "text-ink",
  green: "text-ink",
  purple: "text-ink",
  red: "text-[#DC2626]"
};

// El sparkline es sutil: verde cuando la métrica es "buena", gris neutro el resto.
const sparkStroke: Record<KpiColor, string> = {
  blue: "#9A9BA3",
  green: "#16A34A",
  purple: "#9A9BA3",
  red: "#DC2626"
};

function Sparkline({ data, color }: { data: number[]; color: KpiColor }) {
  const stroke = sparkStroke[color];
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="mt-2.5 h-7">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.14} />
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
  show: (delay: number) => ({ transition: { staggerChildren: 0.07, delayChildren: delay } })
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
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
      className="grid grid-cols-2 gap-2.5"
    >
      {cards.map((card) => {
        const MotionCard = card.href ? motion(Link) : motion.div;
        return (
          <MotionCard
            key={card.label}
            {...(card.href ? { href: card.href } : {})}
            variants={itemVariants}
            whileTap={{ scale: 0.985 }}
            className="card-3d block min-h-[104px] rounded-2xl border border-line bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                {card.label}
              </p>
              <card.icon size={16} className="text-muted/55" />
            </div>
            <p className={cn("mt-2.5 text-[1.35rem] font-semibold leading-tight tracking-[-0.02em]", valueClass[card.color])}>
              <AnimatedNumber value={card.value} />
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted">{card.detail}</p>
            {card.trend && card.trend.length >= 2 ? (
              <Sparkline data={card.trend} color={card.color} />
            ) : card.progress !== undefined ? (
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
                <motion.div
                  className="h-full rounded-full bg-[#2563EB]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                />
              </div>
            ) : null}
          </MotionCard>
        );
      })}
    </motion.div>
  );
}
