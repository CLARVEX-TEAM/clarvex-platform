"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * SegmentedTabs — selector de segmentos con la pastilla deslizándose de una
 * opción a otra.
 *
 * Usa la técnica de `@animate-ui/primitives-effects-highlight`: un único
 * elemento con `layoutId` compartido, que framer-motion interpola entre
 * posiciones al cambiar de padre. El primitivo original son 640 líneas de
 * genéricos con dos modos (`parent`/`children`) y estado controlado y no
 * controlado; aquí solo hace falta el modo `parent` controlado, así que está
 * escrito directo contra los tokens del proyecto en vez de vendorizar la
 * librería entera y traducirla de React 19 a 18.
 *
 * El `layoutId` se deriva de `useId()` para que dos selectores en la misma
 * pantalla no se roben la pastilla el uno al otro.
 *
 * Accesible como tablist: flechas para moverse, `aria-selected` por opción.
 * Con `prefers-reduced-motion` la pastilla salta sin animar.
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
    pill: "bg-card shadow-sm dark:bg-line",
    active: "text-volt",
    inactive: "text-muted hover:text-ink",
    item: "min-h-10 flex-1"
  },
  desk: {
    pill: "bg-accent",
    active: "text-on-accent",
    inactive: "text-muted hover:text-ink",
    item: "min-h-9 px-5"
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
  const layoutId = `segmented-tabs-${React.useId()}`;

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
              // `duration-300` acompaña al muelle de la pastilla. Con la
              // transición por defecto (150 ms) el texto de la pestaña entrante
              // se volvía blanco antes de que la pastilla llegara debajo, y en
              // el escritorio quedaba ilegible sobre el panel claro.
              "relative rounded-full text-sm font-semibold transition-colors duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-volt/30",
              tokens.item,
              active ? tokens.active : tokens.inactive,
              itemClassName
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                // `layout` sin transición propia hereda la del padre; el muelle
                // corto evita que la pastilla "nade" al cambiar de pestaña.
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
                }
                className={cn("absolute inset-0 rounded-full", tokens.pill)}
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
