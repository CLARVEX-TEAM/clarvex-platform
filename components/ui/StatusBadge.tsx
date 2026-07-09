"use client";

import { cn } from "@/lib/utils";
import type { Tone, Accent } from "./shared";
import { badgeTones } from "./shared";
import type { Priority, PendingStatus } from "@/lib/types";

export function StatusBadge({ children, tone = "default" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black tracking-[-0.01em]", badgeTones[tone])}>
      {children}
    </span>
  );
}

export const Badge = StatusBadge;

export function priorityTone(priority: Priority): Tone {
  if (priority === "critica") return "danger";
  if (priority === "alta") return "warn";
  return "default";
}

export function statusTone(status: PendingStatus): Tone {
  return status === "completado" ? "success" : status === "en proceso" ? "warn" : "default";
}

// Color semántico por alcance (%): el avance se lee de un vistazo sin mirar la cifra.
// ≥100% verde · 90–99% ámbar · <90% rojo.
export function achievementTone(progress: number): Accent {
  if (progress >= 100) return "mint";
  if (progress >= 90) return "ember";
  return "orchid";
}
