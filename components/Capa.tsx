"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Saca un `position: fixed` al `body`, para que su `z-index` valga de verdad.
 *
 * ⚠️ **SIN ESTO, TODO OVERLAY DE UNA PANTALLA SE PINTA DEBAJO DE LA BARRA DE
 * ABAJO**, y no da ningún error: se ve como una hoja a la que le falta el
 * último renglón.
 *
 * La causa está en `app/globals.css`, y es deliberada:
 *
 * ```css
 * @layer base { body > * { position: relative; z-index: 1; } }
 * ```
 *
 * Sube el contenido por encima del fondo animado --`.meteors` y `.dot-pattern`
 * van en `z-index: 0`--. El envoltorio de `PageTransition` es un `<div>` sin
 * una sola clase, así que esa regla le entra entera: queda **posicionado y en
 * `z-index: 1`, o sea es un CONTEXTO DE APILAMIENTO**. Y dentro de un contexto,
 * un `z-50` solo compite con sus hermanos: frente al resto de la página vale 1.
 *
 * La barra de abajo cuelga directamente del `body` y lleva clases de Tailwind,
 * que ganan a la capa `base`, así que conserva su `z-30` en la raíz. El
 * resultado es que **1 &lt; 30** y la barra tapa cualquier hoja, por alto que
 * tenga el número.
 *
 * ⚠️ **Y no se arregla subiendo el número.** Ni `z-[9999]` dentro de un
 * contexto de `z-index: 1` sale de él; es la trampa de esto, porque subir el
 * número es lo primero que uno prueba. Tampoco vale subir el envoltorio por
 * encima de la barra: entonces la página entera taparía la barra, que está
 * para flotar sobre ella.
 *
 * Portal al `body`, entonces: ahí el overlay es `body > *` como la barra, sus
 * utilidades ganan igual a la capa `base`, y su `z-index` se compara con el de
 * la barra en la raíz. Es lo que ya hacían `components/forms.tsx` y los
 * componentes de Conteos; esto solo le pone nombre para que no haya que
 * redescubrirlo.
 *
 * ⚠️ **El `montada` no es ceremonia.** En el servidor no hay `document`, y
 * pintar en el primer render del cliente lo que el servidor no pintó rompe la
 * hidratación. Se monta en un efecto, que es cuando el portal ya puede existir.
 */
export function Capa({ children }: { children: React.ReactNode }) {
  const [montada, setMontada] = useState(false);

  useEffect(() => { setMontada(true); }, []);

  if (!montada || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
