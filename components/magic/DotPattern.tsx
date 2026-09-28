/**
 * DotPattern — rejilla de puntos difuminada hacia los bordes.
 *
 * El único fondo del catálogo que NO se mueve, y por eso el más seguro: da
 * profundidad sin costar batería ni robar atención. No lleva "use client"
 * porque no tiene estado ni eventos: es un Server Component y no añade nada al
 * bundle de JavaScript.
 *
 * Se apoya en `currentColor` a través del token de texto, así que se adapta
 * solo al tema claro y oscuro sin duplicar reglas.
 */
export function DotPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      // La clase `dot-pattern` no estiliza nada: es un punto de anclaje para
      // poder ocultarlo en las pruebas visuales. Al ser `position: fixed`, en
      // una captura de página completa se desplaza con el scroll y la imagen
      // nunca se estabiliza.
      className={className ? `dot-pattern ${className}` : "dot-pattern"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgb(var(--ch-ink) / 0.10) 1px, transparent 0)",
        backgroundSize: "22px 22px",
        maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 35%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 35%, transparent 75%)"
      }}
    />
  );
}
