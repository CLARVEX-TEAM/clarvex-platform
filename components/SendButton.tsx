"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

/**
 * SendButton — botón de "enviar" con un avión de papel que DESPEGA.
 *
 * Coreografía (impulsada por props `loading` → `success`):
 *   idle    → avión en reposo con un leve cabeceo.
 *   loading → el avión retrocede un pelín (carrera), levanta la nariz y sale
 *             volando por la esquina superior derecha dejando una estela.
 *   success → entra un ✓ con un pequeño rebote y el texto cambia a `sentLabel`.
 *
 * Si el usuario tiene reduce-motion activo, cae a un spinner → ✓ sin vuelo.
 */
export function SendButton({
  children = "Enviar",
  sentLabel,
  loading = false,
  success = false,
  className = "",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  /** Texto al terminar con éxito. Si se omite, mantiene `children`. */
  sentLabel?: React.ReactNode;
  loading?: boolean;
  success?: boolean;
}) {
  const reduce = useReducedMotion();
  const phase = success ? "sent" : loading ? "flying" : "idle";

  useEffect(() => {
    if (success) haptic("success");
  }, [success]);

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      onTap={() => haptic("light")}
      transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.6 }}
      {...props}
      disabled={loading || success || props.disabled}
      className={cn(
        "tappable relative inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black tracking-[-0.01em] focus:outline-none focus:ring-4 disabled:cursor-not-allowed",
        // overflow visible para que el avión pueda "salir" del botón al despegar.
        // (sin btn-sheen: su franja blanca asomaría por el borde al no recortarse)
        "overflow-visible",
        !success &&
          "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_8px_30px_rgba(37,99,235,0.35)] hover:shadow-[0_12px_36px_rgba(37,99,235,0.45)] focus:ring-blue-500/20",
        success &&
          "bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-[0_8px_30px_rgba(34,197,94,0.35)] focus:ring-emerald-500/20",
        className
      )}
    >
      <span className="relative grid size-5 place-items-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {phase === "sent" ? (
            <motion.span
              key="check"
              initial={{ scale: 0, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 480, damping: 18 }}
              className="absolute"
            >
              <Check size={18} />
            </motion.span>
          ) : (
            <motion.span key="plane" className="absolute" exit={{ opacity: 0 }}>
              {/* Estela: aparece sólo durante el despegue */}
              {phase === "flying" && !reduce ? (
                <span className="pointer-events-none absolute right-1.5 top-2.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                      animate={{
                        opacity: [0, 0.7, 0],
                        scale: [0.4, 1, 0.5],
                        x: -6 - i * 5,
                        y: 3 + i * 4
                      }}
                      transition={{
                        duration: 0.55,
                        delay: 0.12 + i * 0.05,
                        ease: "easeOut"
                      }}
                      className="absolute block size-1 rounded-full bg-white/70"
                    />
                  ))}
                </span>
              ) : null}

              {/* El avión */}
              <motion.span
                className="block"
                animate={
                  reduce
                    ? {}
                    : phase === "flying"
                      ? {
                          x: [0, -4, 130],
                          y: [0, 2, -78],
                          rotate: [0, -12, 26],
                          scale: [1, 1.08, 0.62],
                          opacity: [1, 1, 0]
                        }
                      : { y: [0, -1.5, 0], rotate: [0, 2, 0] }
                }
                transition={
                  phase === "flying"
                    ? { duration: 0.7, times: [0, 0.16, 1], ease: [0.4, 0, 0.2, 1] }
                    : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                }
              >
                {/* spinner sutil bajo el avión cuando reduce-motion: muestra trabajo */}
                {reduce && phase === "flying" ? (
                  <span className="block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Send size={17} className="-rotate-[18deg]" />
                )}
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={phase === "sent" && sentLabel ? "sent" : "label"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="block"
          >
            {phase === "sent" && sentLabel ? sentLabel : children}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

/**
 * SendIconButton — botón cuadrado de sólo icono (chat / comentarios).
 * Mientras `loading`, el avión pugna por despegar en bucle (nudge arriba-derecha).
 */
export function SendIconButton({
  loading = false,
  className = "",
  size = 16,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & { loading?: boolean; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onTap={() => haptic("light")}
      transition={{ type: "spring", stiffness: 520, damping: 28 }}
      {...props}
      className={cn(
        "tappable grid size-11 shrink-0 place-items-center overflow-visible rounded-2xl bg-volt text-white disabled:opacity-40",
        className
      )}
    >
      <motion.span
        animate={
          reduce || !loading
            ? { x: 0, y: 0, rotate: 0, opacity: 1 }
            : { x: [0, 3, 0], y: [0, -3, 0], rotate: [0, 9, 0], opacity: [1, 0.55, 1] }
        }
        transition={
          loading && !reduce
            ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 500, damping: 28 }
        }
      >
        <Send size={size} className="-rotate-[18deg]" />
      </motion.span>
    </motion.button>
  );
}
