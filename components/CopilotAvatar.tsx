"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type CopilotAvatarProps = {
  size?: number;
  className?: string;
  pulse?: boolean;
};

/** Icono del agente Copilot: barras KPI + nodo IA, estilo CLARVEX (volt sobre negro). */
export function CopilotAvatar({ size = 40, className, pulse = false }: CopilotAvatarProps) {
  const rawId = useId().replace(/:/g, "");
  const bgId = `copilot-bg-${rawId}`;
  const ringId = `copilot-ring-${rawId}`;
  const shineId = `copilot-shine-${rawId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(pulse && "animate-pulse", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f1f14" />
          <stop offset="55%" stopColor="#0a0f0c" />
          <stop offset="100%" stopColor="#050505" />
        </linearGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00FF66" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#00FF66" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.5" />
        </linearGradient>
        <filter id={shineId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx="24" cy="24" r="22" fill={`url(#${bgId})`} stroke={`url(#${ringId})`} strokeWidth="1.5" />
      <circle cx="24" cy="24" r="20" stroke="#00FF66" strokeOpacity="0.08" strokeWidth="0.5" />

      {/* Barras KPI */}
      <rect x="13" y="27" width="5" height="9" rx="1.5" fill="#00FF66" fillOpacity="0.45" />
      <rect x="20" y="21" width="5" height="15" rx="1.5" fill="#00FF66" fillOpacity="0.7" />
      <rect x="27" y="15" width="5" height="21" rx="1.5" fill="#00FF66" />

      {/* Tendencia */}
      <path
        d="M12 30 L19 24 L26 26 L34 16"
        stroke="#00FF66"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
        fill="none"
      />

      {/* Nodo IA */}
      <circle cx="35" cy="13" r="3.2" fill="#00FF66" filter={`url(#${shineId})`} />
      <path
        d="M35 8.5v2.2M35 15.3v2.2M30.5 13h2.2M37.3 13h2.2M31.8 9.8l1.6 1.6M36.6 14.6l1.6 1.6M31.8 16.2l1.6-1.6M36.6 11.4l1.6-1.6"
        stroke="#00FF66"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
    </svg>
  );
}
