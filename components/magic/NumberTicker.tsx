"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * NumberTicker — la cifra sube hasta su valor en lugar de aparecer de golpe.
 *
 * De todos los efectos de Magic UI es el único que aporta lectura y no solo
 * adorno: ver subir el número comunica magnitud. Por eso es el que conviene
 * usar en las cifras que importan (venta del día, comisión) y no en todas.
 *
 * - Respeta `prefers-reduced-motion`: pinta el valor final sin animar.
 * - Arranca cuando el elemento entra en pantalla, no al montarse, para que la
 *   animación no se pierda en tarjetas que están más abajo del scroll.
 * - `format` recibe el valor intermedio, así se puede pasar `money` de
 *   `lib/format` y mantener el formato de moneda de la app.
 */
export function NumberTicker({
  value,
  format = (n) => String(Math.round(n)),
  durationMs = 900,
  delayMs = 0,
  className
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  delayMs?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const node = ref.current;
    if (!node) return;

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        // ease-out-quart: arranca rápido y frena, sin rebote
        setShown(value * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        timer = setTimeout(run, delayMs);
      },
      { threshold: 0.4 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [value, durationMs, delayMs, reduce]);

  // tabular-nums evita que el ancho baile mientras cuenta.
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(shown)}
    </span>
  );
}
