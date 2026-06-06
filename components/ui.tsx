"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckSquare,
  Home,
  Megaphone,
  Plus,
  UserRound
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Activity, PendingStatus, Priority } from "@/lib/types";

type Tone = "default" | "success" | "done" | "warn" | "danger" | "info";
type Accent = "volt" | "mint" | "ember" | "orchid";

const accentText: Record<Accent, string> = {
  volt: "text-volt",
  mint: "text-volt",
  ember: "text-ember",
  orchid: "text-orchid"
};

const accentBg: Record<Accent, string> = {
  volt: "bg-volt",
  mint: "bg-volt",
  ember: "bg-ember",
  orchid: "bg-orchid"
};

const badgeTones: Record<Tone, string> = {
  default: "border-white/10 bg-white/[0.055] text-muted",
  success: "border-volt/30 bg-volt/12 text-volt",
  done: "border-volt/30 bg-volt/12 text-volt",
  warn: "border-ember/35 bg-ember/12 text-ember",
  danger: "border-orchid/35 bg-orchid/12 text-orchid",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-200"
};

export function GlassCard({ children, className = "", ...props }: Omit<HTMLMotionProps<"section">, "children"> & { children: React.ReactNode }) {
  return (
    <motion.section
      {...props}
      initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn("liquid-glass rounded-[1.55rem] p-4 shadow-glass", className)}
    >
      {children}
    </motion.section>
  );
}

export const Card = GlassCard;

export function PremiumButton({
  children,
  className = "",
  loading = false,
  icon,
  disabled,
  variant = "glass",
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  loading?: boolean;
  icon?: React.ReactNode;
  variant?: "primary" | "glass" | "ghost";
}) {
  return (
    <motion.button
      {...props}
      whileTap={{ scale: 0.965, y: 1 }}
      whileHover={{ y: -1 }}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-volt/20 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-volt text-void shadow-[0_18px_40px_rgb(34_197_94_/_0.24)] hover:bg-[#16A34A]",
        variant === "glass" && "liquid-glass text-ink hover:text-volt",
        variant === "ghost" && "bg-white/[0.045] text-ink hover:bg-white/[0.075]",
        className
      )}
      disabled={loading || disabled}
    >
      {loading ? <span className="size-2.5 animate-pulse rounded-full bg-current" /> : icon}
      {children}
    </motion.button>
  );
}

export const Button = PremiumButton;

export function StatusBadge({ children, tone = "default" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black", badgeTones[tone])}>
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

export function ProgressBar({ value, tone = "volt" }: { value: number; tone?: Accent }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
      <motion.div
        className={cn("h-full rounded-full", accentBg[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function ProgressRing({ value, tone = "volt", size = 76 }: { value: number; tone?: Accent; size?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90 drop-shadow-[0_0_18px_rgb(34_197_94_/_0.18)]">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-white/10" />
        <motion.circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={cn("stroke-current", accentText[tone])}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (clamped / 100) * circumference }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute text-sm font-black text-ink">{clamped}%</span>
    </div>
  );
}

export function KPIStatCard({
  label,
  value,
  detail,
  tone = "volt",
  progress,
  delta,
  icon
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Accent;
  progress?: number;
  delta?: string;
  icon?: React.ReactNode;
}) {
  return (
    <GlassCard className="min-h-[132px]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted">{label}</p>
        {icon ? <span className={cn("grid size-8 place-items-center rounded-xl bg-white/[0.055]", accentText[tone])}>{icon}</span> : null}
        {!icon && delta ? <StatusBadge tone="success">{delta}</StatusBadge> : null}
      </div>
      <p className={cn("mt-3 text-2xl font-black leading-none", accentText[tone])}>{value}</p>
      {progress !== undefined ? <ProgressBar value={progress} tone={tone} /> : null}
      {detail ? <p className="mt-2 text-sm text-muted">{detail}</p> : null}
    </GlassCard>
  );
}

export const StatCard = KPIStatCard;

export function TaskItem({ activity, onToggle }: { activity: Activity; onToggle?: (completed: boolean) => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.985, y: 1 }}
      onClick={() => onToggle?.(!activity.completed)}
      className="liquid-glass flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:text-volt"
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-xl border transition",
          activity.completed ? "border-volt bg-volt/20 text-volt" : "border-white/15 text-transparent"
        )}
      >
        {activity.completed ? (
          <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 520, damping: 26 }}>
            <Check size={17} />
          </motion.span>
        ) : (
          <Check size={17} />
        )}
      </span>
      <span className={cn("text-sm font-semibold", activity.completed ? "text-muted line-through" : "text-ink/90")}>{activity.title}</span>
    </motion.button>
  );
}

export function NotificationCard({
  title,
  body,
  meta,
  unread,
  action
}: {
  title: string;
  body: string;
  meta?: string;
  unread?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <GlassCard className={cn(unread && "border-volt/35 bg-volt/[0.055]")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", unread ? "bg-volt/16 text-volt" : "bg-white/[0.055] text-muted")}>
          <Bell size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-ink">{title}</h2>
              {meta ? <p className="mt-1 text-xs text-muted">{meta}</p> : null}
            </div>
            <StatusBadge tone={unread ? "success" : "default"}>{unread ? "nuevo" : "leido"}</StatusBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </GlassCard>
  );
}

export function AppHeader({
  title,
  subtitle,
  action,
  backHref,
  avatar
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  backHref?: string;
  avatar?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-void/72 px-4 pb-3 pt-5 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {backHref ? (
            <Link href={backHref} className="liquid-glass mt-1 grid size-10 shrink-0 place-items-center rounded-2xl text-ink/70" aria-label="Regresar al inicio">
              <ArrowLeft size={18} />
            </Link>
          ) : avatar ? (
            <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-2xl bg-volt/15 text-sm font-black text-volt">{avatar}</span>
          ) : null}
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-volt">CLARVEX Team</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-ink">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
    </header>
  );
}

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/manager", label: "Inicio", icon: Home },
  { href: "/plan", label: "Plan", icon: CheckSquare },
  { href: "/pendientes", label: "Pend.", icon: AlertTriangle },
  { href: "/kpis", label: "KPIs", icon: BarChart3 },
  { href: "/comunicados", label: "Com.", icon: Megaphone }
];

export function LiquidBottomNav() {
  const [homeHref, setHomeHref] = useState("/manager");
  const pathname = usePathname();

  useEffect(() => {
    const session = getSession();
    setHomeHref(session?.role === "ASESOR" ? "/advisor" : "/manager");
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4">
      <div className="liquid-glass pointer-events-auto mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[2.2rem] border-white/15 bg-card/55 p-2">
        {navItems.map((item) => {
          const href = item.href === "/manager" ? homeHref : item.href;
          const active = pathname === href || (item.href === "/manager" && (pathname === "/manager" || pathname === "/advisor"));
          return (
            <Link
              key={item.href}
              href={href}
              className="relative flex min-h-12 flex-col items-center justify-center rounded-[1.55rem] text-[11px] font-bold text-muted transition hover:text-volt"
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-[1.55rem] border border-volt/35 bg-volt/15 shadow-[0_0_28px_rgb(34_197_94_/_0.22)]"
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <span className={cn("relative grid size-6 place-items-center", active && "text-volt")}>
                <item.icon size={19} />
              </span>
              <span className={cn("relative mt-1", active && "text-volt")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const BottomNav = LiquidBottomNav;

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto min-h-screen max-w-md px-4 pb-36 pt-3"
    >
      {children}
    </motion.main>
  );
}

export function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="liquid-glass group flex min-h-16 items-center gap-3 rounded-2xl px-4 text-sm font-black text-ink/90">
      <span className="grid size-10 place-items-center rounded-2xl bg-volt/12 text-volt">
        <Icon size={20} />
      </span>
      {label}
    </Link>
  );
}

export function FloatingActionButton({ href, icon: Icon = Plus, label }: { href: string; icon?: LucideIcon; label: string }) {
  return (
    <Link href={href} className="fixed bottom-28 right-4 z-20 flex min-h-14 items-center gap-2 rounded-full bg-volt px-5 text-sm font-black text-void shadow-[0_18px_42px_rgb(34_197_94_/_0.28)]">
      <Icon size={18} />
      {label}
    </Link>
  );
}

export const pageIcons = { CalendarDays, BookOpen, UserRound };
