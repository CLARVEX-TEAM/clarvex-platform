import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge no conoce los tamaños de fuente propios del proyecto
 * (text-caption, text-ui, text-h2…) y, al seguir el patrón `text-<algo>`, los
 * clasificaba como COLOR de texto. Consecuencia: en cualquier `cn()` donde
 * coincidieran un tamaño y un color, uno de los dos se descartaba en silencio.
 *
 * Eso rompió el degradado del título del escritorio — `text-transparent` se
 * perdía frente a `text-lead`, el texto quedaba opaco y tapaba el gradiente —
 * y hacía que los botones perdieran su tamaño de letra.
 *
 * Registrarlos en el grupo `font-size` es la corrección de raíz: a partir de
 * aquí un tamaño solo compite con otro tamaño, y un color con otro color.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "ui", "lead", "h3", "h2", "h1", "metric"] }]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
