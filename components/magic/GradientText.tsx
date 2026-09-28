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
  as: Tag = "span",
  // Colores por los que pasa el brillo. El valor por omisión es el azul de
  // marca sobre fondo claro; sobre un lienzo oscuro hay que aclararlos o el
  // barrido abre un bache oscuro en mitad de un título claro.
  via = ["#2563EB", "#93BBFF"]
}: {
  children: React.ReactNode;
  className?: string;
  durationSec?: number;
  as?: "span" | "h1" | "h2" | "h3";
  via?: [string, string];
}) {
  const reduce = useReducedMotion();

  if (reduce) return <Tag className={className}>{children}</Tag>;

  return (
    <Tag
      className={cn("bg-clip-text text-transparent animate-[gradient-sweep_var(--grad-dur)_linear_infinite]", className)}
      style={{
        // La franja de color va ANCHA (18%→82%): con la anterior (42%→52%) el
        // brillo cruzaba tan rápido que el título se veía blanco casi siempre.
        backgroundImage:
          `linear-gradient(90deg, rgb(var(--ch-ink)) 6%, ${via[0]} 30%, ${via[1]} 50%, ${via[0]} 70%, rgb(var(--ch-ink)) 94%)`,
        backgroundSize: "220% 100%",
        // La transparencia va en estilo y NO solo en la clase `text-transparent`:
        // si quien llama pasa cualquier `text-*`, tailwind-merge se queda con esa
        // y descarta la transparente, dejando el texto opaco encima del degradado
        // — que es justo lo que estaba pasando.
        color: "transparent",
        WebkitTextFillColor: "transparent",
        ["--grad-dur" as string]: `${durationSec}s`
      }}
    >
      {children}
    </Tag>
  );
}
