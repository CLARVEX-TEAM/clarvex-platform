"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SelectorChips — elegir UN valor entre pocos.
 *
 * ⚠️ **La pastilla NO se desliza de una opción a otra.** La primera versión la
 * hacía viajar con `layoutId` de framer-motion; el usuario la vio en el teléfono
 * y la descartó. El marcado cambia seco, que además es lo que se espera de un
 * campo de formulario: el movimiento sugiere que algo está pasando, y aquí solo
 * se está eligiendo un valor.
 *
 * ⚠️ **Existe porque `SegmentedTabs` reparte el ancho a partes IGUALES**
 * (`flex-1`). Con cinco opciones en un teléfono de 412 px cada una se queda en
 * ~78 px, y las etiquetas reales de este proyecto no caben: «Atención al
 * cliente», «Etiqueta / precio», «Inventario». Se cortaban. Aquí cada chip mide
 * lo que mide su texto y la fila se parte cuando hace falta.
 *
 * ⚠️ Y es un `radiogroup`, NO un `tablist`. Las pestañas cambian lo que se ve;
 * esto elige el valor que se va a GUARDAR. Un lector de pantalla que lo anuncia
 * como pestañas no dice que haya nada que enviar.
 *
 * Sustituye a los `<select>` nativos, que en Android abren la rueda del sistema
 * --con su propia tipografía y sus propios colores-- en medio de una pantalla
 * que acabamos de rediseñar. Para listas largas o con foto, la hoja inferior de
 * `AppSelect` (`components/forms.tsx`) sigue siendo la correcta: doce nombres no
 * son chips.
 */

export type ChipOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Para lectores de pantalla cuando `label` no es texto plano. */
  ariaLabel?: string;
};

export function SelectorChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false
}: {
  options: ReadonlyArray<ChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  /*
   * ⚠️ Cuando NINGUNA opcion del grupo esta elegida hay que dejar tabulable la
   * primera. Con `tabIndex={activo ? 0 : -1}` a secas, un grupo sin nada
   * seleccionado se queda con todos sus chips en -1 y deja de existir para el
   * teclado. No es teorico: en Solicitudes hay DOS grupos --dia completo y
   * permiso de horas-- sobre el mismo valor, asi que uno de los dos siempre
   * esta sin elegir, y era el que no se podia alcanzar.
   */
  const hayElegida = options.some((option) => option.value === value);

  /*
   * Flechas circulares, como espera un grupo de radios. Se incluyen arriba y
   * abajo porque los chips se parten en varias filas: quien va con teclado no
   * sabe si la siguiente opción está a la derecha o en el renglón de abajo.
   */
  const alPulsarTecla = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const avance =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!avance || disabled) return;
    event.preventDefault();
    const actual = options.findIndex((option) => option.value === value);
    const siguiente = options[(actual + avance + options.length) % options.length];
    if (siguiente) onChange(siguiente.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={alPulsarTecla}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option, indice) => {
        const activo = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={activo}
            aria-label={option.ariaLabel}
            disabled={disabled}
            // Solo la opción elegida entra en el orden de tabulación: el grupo
            // es UNA parada, y dentro se mueve con las flechas. Sin nada
            // elegido, la primera hace de puerta.
            tabIndex={activo || (!hayElegida && indice === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-semibold",
              "focus:outline-hidden focus-visible:ring-4 focus-visible:ring-volt/30",
              "disabled:opacity-40",
              /*
               * ⚠️ El elegido va en azul TENUE, no relleno. Relleno compite con
               * el botón principal de la misma tarjeta --dos bloques azules
               * macizos en una pantalla-- y la regla es un solo azul sólido por
               * pantalla, el de la acción. Aquí no se acciona nada: se marca un
               * valor, y el borde más el texto azul ya lo dicen sin gritar.
               */
              activo
                ? "border-volt bg-volt/10 text-volt"
                : "border-line text-muted hover:border-volt/40 hover:text-ink"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
