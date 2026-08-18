"use client";

import { useEffect, useState } from "react";
import { keyboardInsetFrom } from "@/lib/keyboard-inset";

/**
 * Píxeles que el teclado en pantalla tapa por abajo. 0 si no hay teclado, o si
 * el navegador no expone `visualViewport` — en ese caso no se toca nada y el
 * comportamiento queda como estaba.
 *
 * El porqué, con detalle, está en `lib/keyboard-inset.ts`.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      setInset(keyboardInsetFrom(window.innerHeight, viewport.height, viewport.offsetTop));
    };

    update();
    // `scroll` además de `resize`: en iOS el viewport visual se desplaza al
    // abrirse el teclado sin que cambie su altura.
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
