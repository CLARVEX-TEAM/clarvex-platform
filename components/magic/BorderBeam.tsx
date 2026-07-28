"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * BorderBeam — un haz de luz recorriendo el borde de una tarjeta.
 *
 * Técnica: un anillo real hecho con `padding`, no un overlay con inset negativo.
 * La primera versión usaba `-inset-px` y el haz solo asomaba por 1px; con un
 * gradiente cónico que es transparente en 300 de sus 360 grados, en un móvil
 * eso resultaba invisible. El anillo con padding garantiza un grosor visible.
 *
 * El hijo debe traer su propio fondo opaco (`bg-card`), que es lo que tapa el
 * centro del gradiente y deja ver solo el anillo.
 *
 * No usa `offset-path` (la implementación oficial de Magic UI sí): esa
 * propiedad es reciente y estos teléfonos son de piso de venta.
 */
export function BorderBeam({
  children,
  className,
  /** Radio EXTERIOR. El interior se calcula restando el grosor del anillo. */
  radius = "rounded-[18px]",
  ringPx = 2,
  durationSec = 5,
  active = true
}: {
  children: React.ReactNode;
  className?: string;
  radius?: string;
  ringPx?: number;
  durationSec?: number;
  active?: boolean;
}) {
  const reduce = useReducedMotion();

  if (!active || reduce) return <>{children}</>;

  return (
    <div
      className={cn("relative isolate overflow-hidden", radius, className)}
      style={{ padding: ringPx }}
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 aspect-square w-[240%] -translate-x-1/2 -translate-y-1/2 animate-[beam-spin_var(--beam-dur)_linear_infinite]"
        style={{
          // Arco corto y brillante sobre fondo transparente: se lee como un haz
          // que da vueltas, no como un borde de color.
          background:
            "conic-gradient(from 0deg, transparent 0deg 286deg, rgb(37 99 235 / 0.9) 322deg, rgb(160 196 255) 340deg, rgb(37 99 235 / 0.9) 350deg, transparent 360deg)",
          ["--beam-dur" as string]: `${durationSec}s`
        }}
      />
      {/* El hijo va por encima del gradiente y tapa el centro. */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
