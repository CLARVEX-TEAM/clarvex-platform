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
  /*
   * ⚠️ **Un solo botón azul por pantalla.** `primary` es la acción principal y
   * es el único con relleno; todo lo demás va de CONTORNO --fondo de la
   * tarjeta, borde y texto azules--. Antes cada botón era una pastilla azul
   * rellena, con sombra de color, un brillo animado y un rebote al pasar por
   * encima: con tres o cuatro en la misma pantalla ninguno destacaba, que es
   * justo lo contrario de para lo que sirve un botón principal.
   *
   * ⚠️ Fuera el `btn-sheen` y las sombras de colorcito. El brillo recorría el
   * botón solo, sin que nadie lo tocara, y la sombra azul teñía el papel
   * blanco que hay debajo.
   */
  return (
    <motion.button
      {...props}
      // Se conserva la respuesta al TOQUE --dice que el botón recibió el dedo,
      // que en un teléfono es información-- y se retira el rebote del hover,
      // que en un teléfono no lo ve nadie.
      whileTap={{ scale: 0.97 }}
      transition={tactileSpring}
      className={cn(
        "app-btn tappable relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-full border px-4 text-sm font-semibold tracking-[-0.01em] focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/40 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "app-btn-primary border-volt bg-volt text-white hover:bg-[#1D4ED8]",
        variant === "success" && "border-mint bg-mint text-white",
        variant === "danger" && "border-orchid/40 bg-card text-orchid hover:bg-orchid/6",
        variant === "glass" && "border-volt/35 bg-card text-volt hover:bg-volt/6",
        variant === "ghost" && "border-line bg-card text-ink hover:border-volt/40 hover:text-volt",
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
