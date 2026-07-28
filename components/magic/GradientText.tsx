"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * GradientText — un gradiente recorre el texto en bucle.
 *
 * ⚠️ SOLO PARA TÍTULOS. En una cifra (venta del día, comisión) reduce el
 * contraste del dato más importante de la pantalla justo cuando el usuario
 * necesita leerlo de un vistazo. En un título el texto ya es conocido y el
 * efecto decora sin costar comprensión.
 *
 * El gradiente arranca y termina en `text-ink`, así que el título nunca queda
 * más claro que el color de texto normal: el brillo solo pasa por encima.
 *
 * Con `prefers-reduced-motion` cae a texto sólido, no a un gradiente estático:
 * un gradiente quieto sigue bajando el contraste sin aportar nada.
 */
export function GradientText({
  children,
  className,
  durationSec = 4.5,
  as: Tag = "span"
}: {
  children: React.ReactNode;
  className?: string;
  durationSec?: number;
  as?: "span" | "h1" | "h2" | "h3";
}) {
  const reduce = useReducedMotion();

  if (reduce) return <Tag className={className}>{children}</Tag>;

  return (
    <Tag
      className={cn("bg-clip-text text-transparent animate-[gradient-sweep_var(--grad-dur)_linear_infinite]", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgb(var(--color-ink)) 20%, #2563EB 42%, #93BBFF 52%, rgb(var(--color-ink)) 74%)",
        backgroundSize: "220% 100%",
        ["--grad-dur" as string]: `${durationSec}s`
      }}
    >
      {children}
    </Tag>
  );
}
