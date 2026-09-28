"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * TabsLinea — pestañas de SUBRAYADO, para cambiar de vista.
 *
 * ⚠️ **Existe para que no haya dos barras iguales con trabajos distintos.** En
 * KPIs había dos tiras de píldoras idénticas, una encima de la otra:
 * «Semana / Mes», que cambia la UNIDAD del dato, y «Resumen / Ventas /
 * Comisión…», que cambia la VISTA. Se leían como lo mismo y había que probar
 * cuál hacía qué. Ahora la unidad es un control segmentado --píldora, que es
 * lo que la gente reconoce como un interruptor de dos estados-- y la vista son
 * pestañas subrayadas, que es lo que se reconoce como navegación.
 *
 * Es el patrón `variant="line"` de ReUI, escrito contra los tokens del
 * proyecto. El bloque original arrastra los primitivos `Tabs`, `Card`, `Input`
 * y `Button` de su propia librería, que chocan con los del proyecto; es la
 * misma decisión que ya tomó [SegmentedTabs] con el primitivo de highlight.
 *
 * ⚠️ **El subrayado aguanta el desbordamiento; la píldora no.** Con seis
 * pestañas en 412 px la tira se desplaza, y una píldora cortada por el borde
 * parece rota --en la captura del teléfono la última salía como «Hi…»--,
 * mientras que una palabra cortada se lee como lo que es: hay más a la derecha.
 * Encima va un degradado en el borde que lo dice sin ocupar sitio.
 */

export type OpcionTab<T extends string> = {
  value: T;
  label: React.ReactNode;
};

export function TabsLinea<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className
}: {
  options: ReadonlyArray<OpcionTab<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const pista = React.useRef<HTMLDivElement>(null);
  const [desborda, setDesborda] = React.useState({ izquierda: false, derecha: false });

  /*
   * El degradado solo aparece por el lado donde DE VERDAD queda contenido. Uno
   * fijo desvanecería la última pestaña cuando caben todas, y entonces mentiría
   * en la dirección cara: diría «hay más» donde no hay nada.
   */
  const medir = React.useCallback(() => {
    const el = pista.current;
    if (!el) return;
    const margen = 2; // el scroll fraccionario deja restos de un píxel
    setDesborda({
      izquierda: el.scrollLeft > margen,
      derecha: el.scrollLeft + el.clientWidth < el.scrollWidth - margen
    });
  }, []);

  React.useEffect(() => {
    medir();
    const el = pista.current;
    if (!el) return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [medir]);

  // Al cambiar de pestaña con el teclado, la elegida se trae a la vista.
  React.useEffect(() => {
    const el = pista.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  const alPulsarTecla = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const avance = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!avance) return;
    event.preventDefault();
    const actual = options.findIndex((option) => option.value === value);
    const siguiente = options[(actual + avance + options.length) % options.length];
    if (siguiente) onChange(siguiente.value);
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={pista}
        role="tablist"
        aria-label={ariaLabel}
        onScroll={medir}
        onKeyDown={alPulsarTecla}
        className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line"
      >
        {options.map((option) => {
          const activo = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={activo}
              tabIndex={activo ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative min-h-11 shrink-0 whitespace-nowrap text-[15px] font-semibold",
                "focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30",
                activo ? "text-volt" : "text-muted hover:text-ink"
              )}
            >
              {option.label}
              {/* El subrayado se pinta pegado al borde inferior, encima de la
                  línea de la pista, así que la sustituye en vez de sumarse. */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 -bottom-px h-0.5 rounded-full",
                  activo ? "bg-volt" : "bg-transparent"
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Los dos velos van FUERA de la pista: dentro se desplazarían con ella. */}
      {desborda.izquierda ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-card to-transparent" />
      ) : null}
      {desborda.derecha ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent" />
      ) : null}
    </div>
  );
}
