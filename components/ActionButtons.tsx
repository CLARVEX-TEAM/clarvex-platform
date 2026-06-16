"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AnimatedCheck — un ✓ que se "dibuja" solo (trazo SVG animado).
 * Reutilizable para confirmar guardados / completados.
 */
export function AnimatedCheck({ size = 18 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M4 12.5l5 5L20 6.5"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

/**
 * DeleteButton — la papelera tiembla y la tapa se inclina al pasar / presionar;
 * mientras `loading` (borrando) tiembla en bucle. Variantes `soft` (contorno) y
 * `solid` (relleno, para confirmaciones).
 */
export function DeleteButton({
  children = "Eliminar",
  loading = false,
  variant = "soft",
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  loading?: boolean;
  variant?: "soft" | "solid";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
      initial="rest"
      whileHover="hover"
      animate={loading ? "shaking" : "rest"}
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        "tappable group inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-black tracking-[-0.01em] focus:outline-none focus:ring-4 focus:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "soft" && "border border-rose-200/60 bg-rose-50/60 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",
        variant === "solid" && "bg-rose-500 text-white shadow-[0_8px_20px_rgb(244_63_94_/_0.28)] hover:bg-rose-600",
        className
      )}
    >
      <motion.span
        className="origin-bottom"
        variants={
          reduce
            ? {}
            : {
                rest: { rotate: 0, x: 0 },
                hover: { rotate: [-8, 6, -4, 0], transition: { duration: 0.45 } },
                shaking: { x: [0, -1.5, 1.5, -1.5, 1.5, 0], transition: { duration: 0.5, repeat: Infinity } }
              }
        }
      >
        <Trash2 size={15} />
      </motion.span>
      {children}
    </motion.button>
  );
}

/**
 * SaveButton — icono de disco en reposo; spinner mientras `loading`; al lograrlo
 * (`success`) entra un ✓ que se dibuja y el botón se vuelve verde.
 */
export function SaveButton({
  children = "Guardar",
  loading = false,
  success = false,
  savedLabel,
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  loading?: boolean;
  success?: boolean;
  savedLabel?: React.ReactNode;
}) {
  const phase = success ? "saved" : loading ? "saving" : "idle";
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
      {...props}
      disabled={loading || success || props.disabled}
      className={cn(
        "tappable relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-black tracking-[-0.01em] focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-55",
        !success && "btn-sheen bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_8px_30px_rgba(37,99,235,0.35)] focus:ring-blue-500/20",
        success && "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-[0_8px_30px_rgba(34,197,94,0.35)] focus:ring-emerald-500/20",
        className
      )}
    >
      <span className="relative grid size-[18px] place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {phase === "saving" ? (
            <motion.span
              key="spin"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : phase === "saved" ? (
            <motion.span key="check" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute">
              <AnimatedCheck size={18} />
            </motion.span>
          ) : (
            <motion.span key="disk" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="absolute">
              <Save size={17} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={phase === "saved" && savedLabel ? "saved" : "label"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            {phase === "saved" && savedLabel ? savedLabel : children}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
}
