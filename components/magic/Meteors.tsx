"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Meteors — estelas diagonales cruzando el fondo.
 *
 * Va montado en el layout, así que corre en TODAS las pantallas y durante toda
 * la jornada de un asesor. Eso obliga a tres salvaguardas que la versión
 * original de Magic UI no trae:
 *
 *  1. Se apaga con la pestaña oculta. Sin esto, el navegador sigue componiendo
 *     capas con la app en segundo plano y se come batería sin que nadie mire.
 *  2. Pocas estelas (6 por defecto). Cada una es una capa compuesta; en un
 *     Android de gama media veinte se notan al hacer scroll.
 *  3. Respeta prefers-reduced-motion: no renderiza nada.
 *
 * Las posiciones se calculan en el cliente tras montar para no desincronizar
 * la hidratación (el servidor no puede generar los mismos aleatorios).
 */
export function Meteors({ count = 6 }: { count?: number }) {
  const reduce = useReducedMotion();
  const [seeds, setSeeds] = useState<{ left: number; delay: number; dur: number }[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setSeeds(
      Array.from({ length: count }, (_, i) => ({
        left: 8 + (i * 92) / count + Math.random() * 8,
        delay: Math.random() * 7,
        dur: 5.5 + Math.random() * 3.5
      }))
    );
  }, [count]);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (reduce || !visible || seeds.length === 0) return null;

  return (
    <div className="meteors" aria-hidden="true">
      {seeds.map((s, i) => (
        <span
          key={i}
          className="meteor"
          style={{
            left: `${s.left}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.dur}s`
          }}
        />
      ))}
    </div>
  );
}
