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
  const isOnTrack = storeProgress >= 80;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className="rounded-[28px] border border-white/50 bg-white/75 px-4 py-3.5 backdrop-blur-2xl dark:border-slate-700/50 dark:bg-slate-800/60"
      style={{ boxShadow: "0 4px 20px rgba(15,23,42,0.06)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-[#2563EB]" />
          <span className="text-sm font-black tracking-[-0.02em] text-slate-900 dark:text-white">Estado tienda</span>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black",
            isOnTrack
              ? "bg-green-50 text-green-600 dark:bg-green-950/40"
              : "bg-orange-50 text-orange-500 dark:bg-orange-950/40"
          )}
        >
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              isOnTrack ? "bg-green-500" : "animate-pulse bg-orange-400"
            )}
          />
          {isOnTrack ? "En ritmo" : "En seguimiento"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="border-r border-slate-100 pr-3 dark:border-slate-700/50">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Conversión</p>
          <p className="mt-1 text-xl font-black text-sky-500">
            {conversion == null ? "—" : `${conversion}%`}
          </p>
        </div>
        <div className="pl-1">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Plan diario</p>
          <p className="mt-1 text-xl font-black text-purple-500">{planProgress}%</p>
        </div>
      </div>
    </motion.div>
  );
}
