"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * ShimmerButton — un destello barre el botón cada pocos segundos.
 *
 * Pensado para UNA acción principal por pantalla. Si dos botones brillan a la
 * vez, ninguno destaca y la pantalla pierde jerarquía: el efecto se anula solo.
 *
 * Mantiene el aspecto de los botones de la app (mismo azul, mismo radio, misma
 * altura mínima táctil); lo único que añade es el barrido.
 */
export function ShimmerButton({
  children,
  className,
  shimmer = true,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { shimmer?: boolean }) {
  const reduce = useReducedMotion();

  return (
    <button
      {...props}
      className={cn(
        "tappable relative isolate min-h-12 w-full overflow-hidden rounded-2xl bg-volt px-4 text-sm font-semibold text-white",
        "transition active:scale-[0.98] disabled:opacity-55",
        className
      )}
    >
      {shimmer && !reduce ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -z-10 w-2/5 animate-[shimmer-sweep_2.8s_cubic-bezier(0.16,1,0.3,1)_infinite]"
          style={{
            background: "linear-gradient(100deg, transparent, rgb(255 255 255 / 0.38), transparent)"
          }}
        />
      ) : null}
      {children}
    </button>
  );
}
