"use client";

import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoreStatusCardProps {
  storeProgress: number;
  conversion: number | null | undefined;
  planProgress: number;
  delay?: number;
}

export function StoreStatusCard({ storeProgress, conversion, planProgress, delay = 0.24 }: StoreStatusCardProps) {
  // Mismos umbrales que achievementTone: ≥100% en meta, 90–99% en ritmo, <90% en seguimiento.
  const status = storeProgress >= 100
    ? { label: "En meta", text: "text-green-600 dark:text-green-500", bg: "bg-green-50 dark:bg-green-950/40", dot: "bg-green-500" }
    : storeProgress >= 90
      ? { label: "En ritmo", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40", dot: "bg-amber-400" }
      : { label: "En seguimiento", text: "text-rose-500 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950/40", dot: "animate-pulse bg-rose-400" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className="card-3d rounded-2xl border border-line bg-card px-4 py-3.5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-muted" />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink/90">Estado tienda</span>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold", status.bg, status.text)}>
          <span className={cn("inline-block size-1.5 rounded-full", status.dot)} />
          {status.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="border-r border-line pr-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Conversión</p>
          <p className="mt-1 text-xl font-semibold text-ink">
            {conversion == null ? "—" : `${conversion}%`}
          </p>
        </div>
        <div className="pl-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Plan diario</p>
          <p className="mt-1 text-xl font-semibold text-ink">{planProgress}%</p>
        </div>
      </div>
    </motion.div>
  );
}
