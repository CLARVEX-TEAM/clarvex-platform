// Barrel re-export: mantiene la API pública idéntica a la de `ui.tsx`.
// Todas las ~50 páginas que importan `from "@/components/ui"` siguen funcionando.

export type { Tone, Accent } from "./shared";
export { accentText, accentBg, badgeTones, tactileSpring } from "./shared";

export { GlassCard, Card } from "./GlassCard";
export { PremiumButton, Button } from "./PremiumButton";
export { StatusBadge, Badge, priorityTone, statusTone, achievementTone } from "./StatusBadge";
export { ProgressBar } from "./ProgressBar";
export { ProgressRing } from "./ProgressRing";
export { KPIStatCard, StatCard } from "./KPIStatCard";
export { ProfileAvatar } from "./ProfileAvatar";
export { TaskItem } from "./TaskItem";
export { NotificationCard } from "./NotificationCard";
export { AppHeader } from "./AppHeader";
export { LiquidBottomNav, BottomNav } from "./LiquidBottomNav";
export { AppFrame, AppCopyright } from "./AppFrame";
export { Skeleton } from "./Skeleton";
export { EmptyState } from "./EmptyState";
export { QuickLink, FloatingActionButton } from "./QuickLink";

// Re-export de iconos de página usados por componentes externos.
import { CalendarDays, BookOpen, UserRound } from "lucide-react";
export const pageIcons = { CalendarDays, BookOpen, UserRound };
