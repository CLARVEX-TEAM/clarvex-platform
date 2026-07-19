"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { tactileSpring } from "./shared";

export function PremiumButton({
  children,
  className = "",
  loading = false,
  success = false,
  icon,
  disabled,
  variant = "glass",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  loading?: boolean;
  /** Muestra un ✓ y bloquea el botón: úsalo tras una accion async exitosa. */
  success?: boolean;
  icon?: React.ReactNode;
  variant?: "primary" | "glass" | "ghost" | "success" | "danger";
}) {
  const solid = variant === "primary" || variant === "success" || variant === "danger";
  return (
    <motion.button
      {...props}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02, y: -1 }}
      transition={tactileSpring}
      className={cn(
        "tappable relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-4 text-sm font-semibold tracking-[-0.01em] focus:outline-none focus-visible:ring-4 focus-visible:ring-volt/40 disabled:cursor-not-allowed disabled:opacity-55",
        solid && "btn-sheen",
        variant === "primary" && "bg-volt text-white shadow-[0_8px_20px_rgb(37_99_235_/_0.22)] hover:bg-[#1D4ED8]",
        variant === "success" && "bg-success text-white shadow-[0_8px_20px_rgb(34_197_94_/_0.24)]",
        variant === "danger" && "bg-orchid text-white shadow-[0_8px_20px_rgb(239_68_68_/_0.22)] hover:bg-[#DC2626]",
        variant === "glass" && "solid-card text-ink hover:text-volt",
        variant === "ghost" && "bg-panel text-ink hover:bg-line/60",
        className
      )}
      disabled={loading || success || disabled}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <motion.span
            key="loading"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={tactileSpring}
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : success ? (
          <motion.span
            key="success"
            initial={{ scale: 0, rotate: -35, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 20 }}
          >
            <Check size={18} />
          </motion.span>
        ) : icon ? (
          <motion.span key="icon" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={tactileSpring}>
            {icon}
          </motion.span>
        ) : null}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

export const Button = PremiumButton;
