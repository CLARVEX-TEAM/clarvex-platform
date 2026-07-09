"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Accent } from "./shared";
import { accentText, accentBg } from "./shared";
import { GlassCard } from "./GlassCard";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import { AnimatedNumber } from "@/components/AnimatedNumber";

export function KPIStatCard({
  label,
  value,
  detail,
  tone = "volt",
  progress,
  delta,
  icon,
  compact = false,
  trend
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Accent;
  progress?: number;
  delta?: string;
  icon?: React.ReactNode;
  compact?: boolean;
  /** Serie real (p. ej. últimos días). Sin ella, la tarjeta NO dibuja barras inventadas. */
  trend?: number[];
}) {
  // Normaliza la serie real a alturas 18–100%. Sin serie con al menos 2 puntos → sin
  // mini-gráfica: nunca fabricamos datos que parezcan una tendencia.
  const bars = (() => {
    if (!trend || trend.length < 2) return null;
    const max = Math.max(...trend);
    const min = Math.min(...trend);
    const span = max - min || 1;
    return trend.map((v) => 18 + ((v - min) / span) * 82);
  })();
  return (
    <GlassCard className={cn(compact ? "min-h-[98px] p-3" : "min-h-[142px] p-4")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
        {icon ? <span className={cn("grid place-items-center border border-line bg-volt/10", compact ? "size-7 rounded-[14px]" : "size-9 rounded-[18px]", accentText[tone])}>{icon}</span> : null}
        {!icon && delta ? <StatusBadge tone="success">{delta}</StatusBadge> : null}
      </div>
      <p className={cn("font-black leading-none tracking-[-0.03em]", compact ? "mt-1.5 text-[1.4rem]" : "mt-3 text-[1.72rem]", accentText[tone])}><AnimatedNumber value={value} /></p>
      {bars ? (
        <div className={cn("flex items-end", compact ? "mt-2 h-3 gap-1" : "mt-3 h-7 gap-1.5")}>
          {bars.map((height, index) => (
            <motion.span
              key={index}
              initial={{ height: 4, opacity: 0.35 }}
              animate={{ height: `${height}%`, opacity: 1 }}
              transition={{ delay: index * 0.035, duration: 0.28 }}
              className={cn("w-full rounded-full bg-line", index === bars.length - 1 && accentBg[tone])}
            />
          ))}
        </div>
      ) : null}
      {progress !== undefined && (!compact || !bars) ? <ProgressBar value={progress} tone={tone} /> : null}
      {detail ? <p className={cn("text-muted", compact ? "mt-1.5 text-[11px] leading-4" : "mt-2 text-[13px] leading-5")}>{detail}</p> : null}
    </GlassCard>
  );
}

export const StatCard = KPIStatCard;
