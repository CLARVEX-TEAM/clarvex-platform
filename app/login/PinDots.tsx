"use client";

import { motion } from "framer-motion";

export function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex justify-center gap-5 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          animate={i === filled - 1 && filled > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
          transition={{ duration: 0.18 }}
          className={`size-[18px] rounded-full transition-colors duration-150 ${
            i < filled
              ? "bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.6)]"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}
