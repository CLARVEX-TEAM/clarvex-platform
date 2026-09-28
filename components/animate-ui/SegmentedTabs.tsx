"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * SegmentedTabs — selector de segmentos.
 *
 * ⚠️ **La pastilla NO se desliza.** Llegó a hacerlo con `layoutId` de
 * framer-motion --la técnica de `@animate-ui/primitives-effects-highlight`--
 * y el usuario la descartó viéndola en el teléfono.
 *
 * Lo que hace ahora en el móvil es **aterrizar**: un marco que entra un poco
 * más grande y se asienta sobre la opción elegida, mientras se desvanece el de
 * la anterior. El movimiento está en el sitio, no en el trayecto -- que es lo
 * que se descartó. Se eligió entre tres variantes probadas en el teléfono.
 *
 * ⚠️ **Solo se anima en la paleta MÓVIL.** El escritorio usa este mismo
 * componente y su aspecto no debe cambiar, así que la animación viaja en el
 * juego de tokens de cada superficie y no en el cuerpo del render.
 *
 * Accesible como tablist: flechas para moverse, `aria-selected` por opción.
 */

export type SegmentedTabOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Etiqueta para lectores de pantalla si `label` no es texto. */
  ariaLabel?: string;
};

/**
 * Las dos paletas del proyecto. El escritorio pinta la pastilla con el acento
 * sólido (`bg-accent`) y el móvil con la tarjeta elevada; sus tokens solo
 * tienen valor real dentro de `[data-surface="desk"]`, así que la variante no
 * se puede deducir sola.
 */
const SURFACES = {
  mobile: {
    pill: "border border-volt bg-card",
    active: "text-volt",
    inactive: "text-muted hover:text-ink",
    item: "min-h-10 flex-1",
    aterriza: true
  },
  desk: {
    pill: "bg-accent",
    active: "text-on-accent",
    inactive: "text-muted hover:text-ink",
    item: "min-h-9 px-5",
    aterriza: false
  }
} as const;

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  surface = "mobile",
  className,
  itemClassName,
  ariaLabel
}: {
  options: ReadonlyArray<SegmentedTabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  surface?: keyof typeof SURFACES;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
}) {
  const tokens = SURFACES[surface];
  const reduce = useReducedMotion();

  // Flechas: mueven la selección de forma circular, como espera un tablist.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const next = options[(current + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("relative flex gap-1 rounded-full bg-panel p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full text-sm font-semibold focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30",
              tokens.item,
              active ? tokens.active : tokens.inactive,
              itemClassName
            )}
          >
            <AnimatePresence initial={false}>
              {active ? (
                <motion.span
                  key="pastilla"
                  aria-hidden
                  initial={tokens.aterriza && !reduce ? { opacity: 0, scale: 1.12 } : { opacity: 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={tokens.aterriza && !reduce ? { opacity: 0, scale: 0.94 } : { opacity: 0 }}
                  transition={
                    tokens.aterriza && !reduce
                      ? { type: "spring", stiffness: 520, damping: 30, mass: 0.6 }
                      : { duration: 0 }
                  }
                  className={cn("absolute inset-0 rounded-full", tokens.pill)}
                />
              ) : null}
            </AnimatePresence>
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
