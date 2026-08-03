"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { tactileSpring } from "@/components/ui/shared";

/**
 * RippleButton — onda que nace donde tocaste, al estilo Material.
 *
 * Portado de Animate UI (`@animate-ui/components-buttons-ripple`) con tres
 * cambios obligados por este proyecto:
 *
 * 1. `forwardRef` en vez de `ref` como prop. El original está escrito para
 *    React 19; aquí corre React 18.3, donde `ref` NO llega dentro de props y
 *    el `useImperativeHandle` del original nunca recibiría nada.
 * 2. La onda se dispara en `pointerdown`, no en `click`. El teclado del PIN ya
 *    respondía en `pointerdown` y una onda que aparece al soltar se siente
 *    tarde.
 * 3. Ids por contador en vez de `Date.now()`: dos toques dentro del mismo
 *    milisegundo producían la misma key de React.
 *
 * El color sale de `currentColor`, así que hereda el del botón que lo use y no
 * necesita una variable por variante como el original.
 */

type Ripple = { id: number; x: number; y: number };

const RIPPLE_MS = 600;

// `children` se acota a ReactNode igual que en PremiumButton: HTMLMotionProps
// admite además MotionValue, que no se puede renderizar directo.
export type RippleButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  /** Escala al mantener pulsado. */
  tapScale?: number;
  /** Escala al pasar el puntero. Sin valor, no hay efecto de hover. */
  hoverScale?: number;
  /** Clases extra para la onda (por defecto hereda `currentColor`). */
  rippleClassName?: string;
};

export const RippleButton = React.forwardRef<HTMLButtonElement, RippleButtonProps>(
  function RippleButton(
    { children, className, rippleClassName, tapScale = 0.95, hoverScale, onPointerDown, ...props },
    forwardedRef
  ) {
    const reduce = useReducedMotion();
    const localRef = React.useRef<HTMLButtonElement>(null);
    const [ripples, setRipples] = React.useState<Ripple[]>([]);
    const nextId = React.useRef(0);
    // Los timers vivos se limpian al desmontar: sin esto, salir de la pantalla
    // con una onda a medias deja programado un setState sobre un componente
    // que ya no existe.
    const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

    React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLButtonElement);

    React.useEffect(() => {
      const pending = timers.current;
      return () => pending.forEach(clearTimeout);
    }, []);

    const handlePointerDown = React.useCallback(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        const button = localRef.current;
        if (button && !reduce) {
          const rect = button.getBoundingClientRect();
          const id = nextId.current++;
          setRipples((prev) => [
            ...prev,
            { id, x: event.clientX - rect.left, y: event.clientY - rect.top }
          ]);
          const timer = setTimeout(() => {
            setRipples((prev) => prev.filter((r) => r.id !== id));
            timers.current = timers.current.filter((t) => t !== timer);
          }, RIPPLE_MS);
          timers.current.push(timer);
        }
        onPointerDown?.(event);
      },
      [onPointerDown, reduce]
    );

    return (
      <motion.button
        {...props}
        ref={localRef}
        onPointerDown={handlePointerDown}
        whileTap={reduce ? undefined : { scale: tapScale }}
        whileHover={reduce || hoverScale === undefined ? undefined : { scale: hoverScale }}
        transition={tactileSpring}
        className={cn("relative overflow-hidden", className)}
      >
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            aria-hidden
            initial={{ scale: 0, opacity: 0.35 }}
            animate={{ scale: 10, opacity: 0 }}
            transition={{ duration: RIPPLE_MS / 1000, ease: "easeOut" }}
            style={{ top: ripple.y - 10, left: ripple.x - 10, backgroundColor: "currentColor" }}
            className={cn("pointer-events-none absolute size-5 rounded-full", rippleClassName)}
          />
        ))}
        {children}
      </motion.button>
    );
  }
);
