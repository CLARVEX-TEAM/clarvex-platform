"use client";

import { motion } from "framer-motion";
import { ProgressBar, ProgressRing } from "@/components/ui";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

interface DailySalesCardProps {
  sales: number;
  goal: number;
  label?: string;
  delay?: number;
  className?: string;
}

export function DailySalesCard({ sales, goal, label = "Venta diaria", delay = 0.08, className }: DailySalesCardProps) {
  const { isDark } = useTheme();
  const progress = goal > 0 ? Math.round((sales / goal) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className={cn("rounded-[32px] border px-5 py-4", className)}
      style={
        isDark
          ? {
              background:
                "radial-gradient(circle at 84% 8%, rgb(59 130 246 / 0.12), transparent 44%), linear-gradient(145deg, #1a2540 0%, #162035 55%, #0f1729 100%)",
              borderColor: "#2a3a5c",
              boxShadow: "0 20px 60px rgba(0,0,0,0.28)"
            }
          : {
              background:
                "radial-gradient(circle at 84% 6%, rgb(14 165 233 / 0.16), transparent 42%), linear-gradient(145deg, #FFFFFF 0%, #EFF6FF 60%, #DBEAFE 82%, #BFDBFE 100%)",
              borderColor: "#DBEAFE",
              boxShadow: "0 20px 60px rgba(37,99,235,0.16)"
            }
      }
    >
      <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-[#2563EB]">{label}</p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[2.5rem] font-black leading-none tracking-[-0.05em] text-slate-900 dark:text-white">
            {money(sales)}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Meta diaria</span>
            <span className="text-sm font-black text-[#2563EB]">{money(goal)}</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={progress} />
          </div>
        </div>
        <div className="shrink-0 text-center">
          <ProgressRing value={progress} tone={progress >= 80 ? "volt" : "ember"} size={72} />
          <p className="mt-1.5 text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            ALCANCE
          </p>
        </div>
      </div>
    </motion.div>
  );
}
