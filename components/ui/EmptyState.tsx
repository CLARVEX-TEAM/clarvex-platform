"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Estado vacío con ícono, mensaje y acción opcional.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center px-6 py-10 text-center"
    >
      <motion.span
        initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 17, delay: 0.08 }}
        className="grid size-14 place-items-center rounded-[20px] border border-line bg-volt/10 text-volt"
      >
        <Icon size={26} />
      </motion.span>
      <p className="mt-3 text-base font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-[16rem] text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </motion.div>
  );
}
