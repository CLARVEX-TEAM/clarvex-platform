"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type CopilotAvatarProps = {
  size?: number;
  className?: string;
  pulse?: boolean;
};

/**
 * Marca del Copilot.
 *
 * Antes era verde neón (#00FF66) sobre un círculo casi negro: estética de
 * terminal que no tenía relación con el azul de Clarvex y que en modo claro se
 * veía como una pastilla negra pegada encima de la app.
 *
 * Ahora usa el degradado azul del logo del acceso, para que se lea como parte
 * del producto y no como un widget de otro sitio.
 *
 * El símbolo se conserva a propósito —barras en ascenso con una línea de
 * tendencia— porque dice lo que el Copilot hace: leer la venta y señalar hacia
 * dónde va. Un destello genérico habría servido para cualquier cosa.
 *
 * El `pulse` ya no es `animate-pulse` (que apaga y enciende el icono entero, y
 * cansa en una pieza que vive en pantalla toda la jornada): ahora es un aro que
 * late alrededor, y respeta `prefers-reduced-motion`.
 */
export function CopilotAvatar({ size = 40, className, pulse = false }: CopilotAvatarProps) {
  const rawId = useId().replace(/:/g, "");
  const bgId = `copilot-bg-${rawId}`;
  const markId = `copilot-mark-${rawId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden
    >
      <defs>
        {/* Mismo degradado que el logo del acceso: es la misma marca. */}
        <linearGradient id={bgId} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={markId} x1="29" y1="36" x2="34" y2="17" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      <circle cx="24" cy="24" r="23" fill={`url(#${bgId})`} />
      {/* Aro interior tenue: define el borde sin necesitar un halo de sombra. */}
      <circle cx="24" cy="24" r="22.2" stroke="#FFFFFF" strokeOpacity="0.2" strokeWidth="0.9" />

      {pulse ? (
        <circle cx="24" cy="24" r="22.5" className="copilot-ring" stroke="#FFFFFF" strokeWidth="1.2" fill="none" />
      ) : null}

      {/* Barras en ascenso. La opacidad creciente ya narra el avance: no hace
          falta meterle un segundo color encima. */}
      <rect x="13" y="28" width="5" height="8" rx="2" fill="#FFFFFF" fillOpacity="0.45" />
      <rect x="21" y="23" width="5" height="13" rx="2" fill="#FFFFFF" fillOpacity="0.72" />
      <rect x="29" y="17" width="5" height="19" rx="2" fill={`url(#${markId})`} />

      {/* Línea de tendencia con su punta. */}
      <path
        d="M13 21 L20.5 16.5 L26.5 19.5 L34.5 12.5"
        stroke="#FFFFFF"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.92"
        fill="none"
      />
      <circle cx="34.5" cy="12.5" r="2.5" fill="#FFFFFF" />
    </svg>
  );
}
