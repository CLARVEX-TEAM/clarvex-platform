"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * AnimatedNumber — cuenta desde 0 hasta el valor objetivo, conservando el
 * formato original (prefijo `$`, separador de miles, decimales, sufijo `%`).
 *
 * Acepta el string ya formateado que usa la app: "$504,771", "82%", "1.85",
 * "2.4x"… Si no hay número (p. ej. "—"), lo muestra tal cual sin animar.
 * Respeta `prefers-reduced-motion`.
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
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  // Separa el primer bloque numérico: prefijo + número + sufijo.
  const match = value.match(/-?[\d.,]+/);

  useEffect(() => {
    const el = ref.current;
    if (!el || !match) {
      setDisplay(value);
      return;
    }

    const numericText = match[0];
    const prefix = value.slice(0, match.index ?? 0);
    const suffix = value.slice((match.index ?? 0) + numericText.length);

    // Decimales: si hay un punto, lo último tras él son decimales.
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
  }, [value, duration, reduce, match]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
