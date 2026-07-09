"use client";

import { cn } from "@/lib/utils";

// Bloque de carga con barrido de luz (shimmer): imita la forma del contenido
// real para una sensación más rápida y premium.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("skeleton-shimmer relative overflow-hidden rounded-2xl bg-line dark:bg-panel", className)} />;
}
