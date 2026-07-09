"use client";

import { motion } from "framer-motion";
import { Delete } from "lucide-react";

export function NumPad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;
  return (
    <div className="grid grid-cols-3 gap-3 px-6">
      {keys.map((k, i) => {
        if (k === "") return <div key={`empty-${i}`} />;
        return (
          <motion.button
            key={k}
            type="button"
            whileTap={{ scale: 0.85 }}
            onPointerDown={(e) => {
              e.preventDefault();
              onKey(k);
            }}
            className={`h-[4.25rem] select-none rounded-2xl text-xl font-bold transition-colors ${
              k === "del"
                ? "flex items-center justify-center text-slate-400 dark:text-slate-500"
                : "bg-white/80 text-slate-900 shadow-sm backdrop-blur-sm dark:bg-slate-800/80 dark:text-white"
            }`}
          >
            {k === "del" ? <Delete size={22} /> : k}
          </motion.button>
        );
      })}
    </div>
  );
}
