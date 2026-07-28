"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * BorderBeam — un haz de luz recorriendo el borde de una tarjeta.
 *
 * Implementado con un gradiente cónico que gira detrás del contenido, no con
 * `offset-path`: esa propiedad es reciente y estos teléfonos son de piso de
 * venta, no de escritorio. Esta técnica funciona en cualquier navegador que ya
 * soporte la app.
 *
 * Se usa como envoltorio: el hijo debe traer su propio fondo opaco (`bg-card`),
 * porque el haz vive por detrás y solo asoma en el borde de 1px.
 *
 * Colores tomados de los tokens de la app, no de la paleta de Magic UI, para
 * que no desentone con el resto.
 */
export function BorderBeam({
  children,
  className,
  radius = "rounded-2xl",
  durationSec = 6,
  active = true
}: {
  children: React.ReactNode;
  className?: string;
  /** Debe coincidir con el radio del hijo para que el borde no se salga. */
  radius?: string;
  durationSec?: number;
  /** Permite apagarlo, p. ej. cuando la tarjeta no es la principal. */
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  const on = active && !reduce;

  return (
    <div className={cn("relative isolate", radius, className)}>
      {on ? (
        <span
          aria-hidden="true"
          className={cn("pointer-events-none absolute -inset-px -z-10 overflow-hidden", radius)}
        >
          <span
            className="absolute left-1/2 top-1/2 aspect-square w-[190%] -translate-x-1/2 -translate-y-1/2 animate-[beam-spin_var(--beam-dur)_linear_infinite]"
            style={{
              // El haz: casi todo transparente y un arco corto de color.
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 296deg, rgb(37 99 235 / 0.85) 330deg, rgb(147 187 255 / 0.95) 346deg, transparent 360deg)",
              ["--beam-dur" as string]: `${durationSec}s`
            }}
          />
        </span>
      ) : null}
      {children}
    </div>
  );
}
