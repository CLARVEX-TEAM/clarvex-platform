"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * TypingText — el texto se revela como si alguien lo escribiera.
 *
 * Solo tiene sentido donde imita a alguien redactando: las respuestas del
 * Copilot. En una etiqueta fija no aporta nada y retrasa la lectura.
 *
 * Tres decisiones que evitan que moleste:
 *
 *  1. **Duración acotada.** Un ritmo fijo por carácter hace que una respuesta
 *     larga tarde diez segundos. Aquí el total se limita a `maxMs`: cuanto más
 *     largo el texto, más caracteres por tick. Nadie espera de más.
 *  2. **Se escribe UNA vez.** El texto ya escrito no se vuelve a animar cuando
 *     el componente re-renderiza (al confirmar una acción, por ejemplo).
 *  3. **Se puede saltar.** `onTick` permite al contenedor seguir el scroll, y
 *     si el texto cambia a mitad, arranca de nuevo en lugar de mezclarse.
 */
export function TypingText({
  text,
  maxMs = 2200,
  tickMs = 24,
  onTick,
  className
}: {
  text: string;
  /** Techo de duración total. Con textos largos acelera en vez de alargarse. */
  maxMs?: number;
  tickMs?: number;
  onTick?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? text : "");
  const typedRef = useRef<string | null>(null);

  useEffect(() => {
    if (reduce) {
      setShown(text);
      return;
    }
    // Ya se escribió este texto: mostrarlo entero y no re-animar.
    if (typedRef.current === text) {
      setShown(text);
      return;
    }
    typedRef.current = text;

    const ticks = Math.max(1, Math.ceil(maxMs / tickMs));
    const step = Math.max(1, Math.ceil(text.length / ticks));
    let i = 0;

    const id = setInterval(() => {
      i = Math.min(text.length, i + step);
      setShown(text.slice(0, i));
      onTick?.();
      if (i >= text.length) clearInterval(id);
    }, tickMs);

    return () => clearInterval(id);
  }, [text, maxMs, tickMs, reduce, onTick]);

  return <span className={className}>{shown}</span>;
}
