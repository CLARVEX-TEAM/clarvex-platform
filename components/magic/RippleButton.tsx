"use client";

import { useCallback, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Ripple = { id: number; x: number; y: number; size: number };

/**
 * RippleButton — una onda sale del punto exacto que se tocó.
 *
 * En móvil con mala cobertura es el efecto más útil de todos: confirma que el
 * toque se registró aunque la petición tarde. Sin esa señal, el usuario vuelve
 * a pulsar y acaba enviando la acción dos veces.
 *
 * La onda se dimensiona al botón, así que cubre igual de bien uno ancho que uno
 * pequeño, y se limpia sola al terminar para no acumular nodos.
 */
export function RippleButton({
  children,
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const reduce = useReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!reduce) {
        const rect = event.currentTarget.getBoundingClientRect();
        // El diámetro cubre la diagonal: la onda llega a cualquier esquina.
        const size = Math.hypot(rect.width, rect.height) * 2;
        const id = nextId.current++;
        setRipples((list) => [
          ...list,
          { id, x: event.clientX - rect.left, y: event.clientY - rect.top, size }
        ]);
        window.setTimeout(() => {
          setRipples((list) => list.filter((r) => r.id !== id));
        }, 620);
      }
      onClick?.(event);
    },
    [onClick, reduce]
  );

  return (
    <button
      {...props}
      onClick={handleClick}
      className={cn("relative isolate overflow-hidden", className)}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          // `bg-current` en vez de blanco fijo: la onda hereda el color de texto
          // del botón, así se ve tanto en uno azul (texto blanco) como en uno
          // claro (texto oscuro). Sin esto, en botones claros era invisible.
          className="pointer-events-none absolute -z-10 rounded-full bg-current animate-[ripple-out_600ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size, marginLeft: -r.size / 2, marginTop: -r.size / 2 }}
        />
      ))}
      {children}
    </button>
  );
}
