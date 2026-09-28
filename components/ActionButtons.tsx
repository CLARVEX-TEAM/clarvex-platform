"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

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
  iconOnly = false,
  iconSize = 15,
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  loading?: boolean;
  variant?: "soft" | "solid" | "ghost";
  /** Sólo el icono (cuadrado). Controla el tamaño con `className`. */
  iconOnly?: boolean;
  iconSize?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onTap={() => haptic("medium")}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
      initial="rest"
      whileHover="hover"
      animate={loading ? "shaking" : "rest"}
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        "tappable group rounded-xl font-semibold tracking-[-0.01em] focus:outline-hidden focus:ring-4 focus:ring-orchid/30 disabled:cursor-not-allowed disabled:opacity-55",
        iconOnly ? "grid place-items-center" : "inline-flex min-h-10 items-center justify-center gap-1.5 px-3 text-sm",
        variant === "soft" && "border border-orchid/30 bg-orchid/10 text-orchid",
        variant === "solid" && "bg-orchid text-white shadow-[0_8px_20px_rgb(244_63_94/0.28)] hover:bg-orchid",
        variant === "ghost" && "text-orchid hover:bg-orchid/10 dark:hover:bg-orchid/10",
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
        <Trash2 size={iconSize} />
      </motion.span>
      {iconOnly ? null : children}
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
  shimmer = false,
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  loading?: boolean;
  success?: boolean;
  savedLabel?: React.ReactNode;
  /**
   * Destello continuo (Magic UI). Distinto de `btn-sheen`, que solo brilla al
   * pulsar: este llama la atención sin que nadie lo toque. UNO por pantalla —
   * si dos botones brillan a la vez, ninguno destaca.
   */
  shimmer?: boolean;
}) {
  const phase = success ? "saved" : loading ? "saving" : "idle";
  const reduceMotion = useReducedMotion();
  // Se calla mientras guarda o al terminar: ahí el botón ya tiene su propia
  // señal (spinner o ✓) y el brillo solo competiría con ella.
  const showShimmer = shimmer && !reduceMotion && phase === "idle";

  useEffect(() => {
    if (success) haptic("success");
  }, [success]);

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onTap={() => haptic("light")}
      transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
      {...props}
      disabled={loading || success || props.disabled}
      className={cn(
        "tappable relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-semibold tracking-[-0.01em] focus:outline-hidden focus:ring-4 disabled:cursor-not-allowed disabled:opacity-55",
        !success && "bg-volt text-white shadow-[0_2px_6px_rgb(20_21_26/0.10)] hover:bg-[#1D4ED8] focus:ring-volt/30",
        success && "bg-mint text-white focus:ring-mint/30",
        className
      )}
    >
      {showShimmer ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-2/5 animate-[shimmer-sweep_2.8s_cubic-bezier(0.16,1,0.3,1)_infinite]"
          style={{ background: "linear-gradient(100deg, transparent, rgb(255 255 255 / 0.35), transparent)" }}
        />
      ) : null}
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
