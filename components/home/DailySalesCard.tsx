"use client";

import { motion } from "framer-motion";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DailySalesCardProps {
  sales: number;
  goal: number;
  label?: string;
  delay?: number;
  className?: string;
}

const CARD_SHADOW = "0 1px 2px rgba(20,21,26,0.04), 0 1px 3px rgba(20,21,26,0.03)";

/** Color del pill de alcance — semántico (verde / ámbar / rojo), no el acento. */
function pillTone(p: number): string {
  if (p >= 100) return "text-[#16A34A] bg-[#EAF6EE] dark:text-[#3AD684] dark:bg-[#10261C]";
  if (p >= 90) return "text-[#B45309] bg-[#FAF2E6] dark:text-[#E0A94A] dark:bg-[#2A2114]";
  return "text-[#DC2626] bg-[#FCECEC] dark:text-[#F26B6B] dark:bg-[#2A1717]";
}

export function DailySalesCard({ sales, goal, label = "Ventas de hoy", delay = 0.08, className }: DailySalesCardProps) {
  const progress = goal > 0 ? Math.round((sales / goal) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn("rounded-2xl border border-line bg-card px-5 py-4", className)}
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
        {goal > 0 ? (
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", pillTone(progress))}>
            {progress}% de la meta
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 text-[2.15rem] font-semibold leading-none tracking-[-0.03em] text-ink">
        {money(sales)}
      </p>

      {goal > 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">
          Meta del día <b className="font-semibold text-ink">{money(goal)}</b>
          {sales >= goal ? (
            <> · <span className="font-semibold text-[#16A34A] dark:text-[#3AD684]">cumplida +{money(sales - goal)}</span></>
          ) : (
            <> · faltan <b className="font-semibold text-ink">{money(goal - sales)}</b></>
          )}
        </p>
      ) : null}

      <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full rounded-full bg-[#2563EB] dark:bg-[#6B9BFF]"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: delay + 0.2 }}
        />
      </div>
    </motion.div>
  );
}
