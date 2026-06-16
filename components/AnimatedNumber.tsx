"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * AnimatedNumber — cuenta desde 0 hasta el valor objetivo, conservando el
 * formato original (prefijo `$`, separador de miles, decimales, sufijo `%`).
 *
 * Acepta el string ya formateado que usa la app: "$504,771", "82%", "1.85",
 * "2.4x"… Si no hay número (p. ej. "—"), lo muestra tal cual sin animar.
 * Respeta `prefers-reduced-motion`.
 *
 * Sólo re-anima cuando cambia `value`: el parseo vive DENTRO del efecto para
 * no crear dependencias nuevas en cada render (eso causaba reinicios a 0).
 */
export function AnimatedNumber({
  value,
  duration = 1.1,
  className = ""
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const match = value.match(/-?[\d.,]+/);

    // Sin número (—, texto): mostrar tal cual.
    if (!match) {
      setDisplay(value);
      return;
    }

    const numericText = match[0];
    const prefix = value.slice(0, match.index ?? 0);
    const suffix = value.slice((match.index ?? 0) + numericText.length);

    const dotIndex = numericText.lastIndexOf(".");
    const decimals = dotIndex >= 0 ? numericText.length - dotIndex - 1 : 0;
    const target = parseFloat(numericText.replace(/,/g, ""));

    if (Number.isNaN(target)) {
      setDisplay(value);
      return;
    }

    const format = (n: number) =>
      `${prefix}${n.toLocaleString("es-MX", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })}${suffix}`;

    if (reduce) {
      setDisplay(format(target));
      return;
    }

    const controls = animate(0, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(format(latest))
    });

    return () => controls.stop();
  }, [value, duration, reduce]);

  return <span className={className}>{display}</span>;
}
