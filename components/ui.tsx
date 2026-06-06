"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  ChevronLeft,
  Home,
  ListChecks,
  Plus,
  UserRound
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Activity, PendingStatus, Priority } from "@/lib/types";

type Tone = "default" | "success" | "done" | "warn" | "danger" | "info";
type Accent = "volt" | "mint" | "ember" | "orchid" | "purple" | "sky";

const accentText: Record<Accent, string> = {
  volt: "text-volt",
  mint: "text-volt",
  ember: "text-ember",
  orchid: "text-orchid",
  purple: "text-purple",
  sky: "text-sky"
};

const accentBg: Record<Accent, string> = {
  volt: "bg-volt",
  mint: "bg-volt",
  ember: "bg-ember",
  orchid: "bg-orchid",
  purple: "bg-purple",
  sky: "bg-sky"
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
      initial={{ opacity: 0, y: 10, scale: 0.99, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      whileTap={{ scale: 0.99, y: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn("liquid-glass rounded-[26px] p-3.5 shadow-glass", className)}
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
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-black tracking-[-0.01em] transition focus:outline-none focus:ring-4 focus:ring-volt/20 disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "bg-volt text-void shadow-[0_18px_44px_rgb(34_197_94_/_0.26),inset_0_1px_0_rgb(255_255_255_/_0.32)] hover:bg-[#16A34A]",
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

export function ProgressBar({ value, tone = "volt" }: { value: number; tone?: Accent }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.075] shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.26)]">
      <motion.div
        className={cn("h-full rounded-full shadow-[0_0_20px_rgb(34_197_94_/_0.22)]", accentBg[tone])}
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
    <div className="relative grid place-items-center rounded-full bg-white/[0.035] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.1)]" style={{ width: size, height: size }}>
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
  icon,
  compact = false
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Accent;
  progress?: number;
  delta?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  const bars = progress !== undefined ? [34, 52, 46, Math.max(18, Math.min(92, progress)), Math.max(24, Math.min(96, progress + 8))] : [28, 45, 36, 58, 48];
  return (
    <GlassCard className={cn(compact ? "min-h-[98px] p-3" : "min-h-[142px] p-4")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">{label}</p>
        {icon ? <span className={cn("grid place-items-center border border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.1)]", compact ? "size-7 rounded-[14px]" : "size-9 rounded-[18px]", accentText[tone])}>{icon}</span> : null}
        {!icon && delta ? <StatusBadge tone="success">{delta}</StatusBadge> : null}
      </div>
      <p className={cn("font-black leading-none tracking-[-0.03em]", compact ? "mt-1.5 text-[1.4rem]" : "mt-3 text-[1.72rem]", accentText[tone])}>{value}</p>
      <div className={cn("flex items-end", compact ? "mt-2 h-3 gap-1" : "mt-3 h-7 gap-1.5")}>
        {bars.map((height, index) => (
          <motion.span
            key={index}
            initial={{ height: 4, opacity: 0.35 }}
            animate={{ height: `${height}%`, opacity: 1 }}
            transition={{ delay: index * 0.035, duration: 0.28 }}
            className={cn("w-full rounded-full bg-white/10", index >= 3 && accentBg[tone])}
          />
        ))}
      </div>
      {!compact && progress !== undefined ? <ProgressBar value={progress} tone={tone} /> : null}
      {detail ? <p className={cn("text-muted", compact ? "mt-1.5 text-[11px] leading-4" : "mt-2 text-[13px] leading-5")}>{detail}</p> : null}
    </GlassCard>
  );
}

export const StatCard = KPIStatCard;

export function ProfileAvatar({
  name,
  photoUrl,
  size = "md",
  className = ""
}: {
  name: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initials = name.slice(0, 2).toUpperCase();
  const sizes = {
    sm: "size-10 rounded-2xl text-sm",
    md: "size-12 rounded-[1.15rem] text-base",
    lg: "size-20 rounded-[1.55rem] text-2xl"
  };

  if (photoUrl) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden ring-1 ring-white/15", sizes[size], className)}>
        <Image src={photoUrl} alt={name} fill sizes="80px" className="object-cover" />
      </span>
    );
  }

  return (
    <span className={cn("grid shrink-0 place-items-center bg-volt/15 font-black text-volt shadow-[inset_0_1px_0_rgb(255_255_255_/_0.16),0_12px_28px_rgb(0_0_0_/_0.26)] ring-1 ring-volt/25", sizes[size], className)}>
      {initials}
    </span>
  );
}

export function PinPad({
  value,
  onChange,
  length = 4
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}) {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  const masked = Array.from({ length }, (_, index) => index < value.length);

  return (
    <div>
      <div className="mb-4 flex justify-center gap-3">
        {masked.map((filled, index) => (
          <span key={index} className={cn("size-3 rounded-full border transition", filled ? "border-volt bg-volt shadow-[0_0_18px_rgb(34_197_94_/_0.45)]" : "border-white/18 bg-white/[0.04]")} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {digits.map((digit, index) => {
          if (!digit) return <span key={index} />;
          return (
            <motion.button
              key={digit}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                if (digit === "back") {
                  onChange(value.slice(0, -1));
                  return;
                }
                if (value.length < length) onChange(`${value}${digit}`);
              }}
              className="liquid-glass grid min-h-14 place-items-center rounded-[24px] text-xl font-black text-ink"
              aria-label={digit === "back" ? "Borrar PIN" : `Numero ${digit}`}
            >
              {digit === "back" ? <ChevronLeft size={22} /> : digit}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function TaskItem({ activity, onToggle }: { activity: Activity; onToggle?: (completed: boolean) => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.985, y: 1 }}
      onClick={() => onToggle?.(!activity.completed)}
      className="flex min-h-11 w-full items-center gap-3 border-b border-white/[0.07] px-1 py-2 text-left transition last:border-b-0 hover:text-volt"
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-[10px] border transition",
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
    <GlassCard className={cn("p-3", unread && "border-volt/35 bg-volt/[0.055]")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[16px] border border-white/10", unread ? "bg-volt/16 text-volt" : "bg-white/[0.055] text-muted")}>
          <Bell size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-black leading-5 tracking-[-0.02em] text-ink">{title}</h2>
              {meta ? <p className="mt-0.5 text-[11px] text-muted">{meta}</p> : null}
            </div>
            <StatusBadge tone={unread ? "success" : "default"}>{unread ? "nuevo" : "leido"}</StatusBadge>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted">{body}</p>
          {action ? <div className="mt-2.5">{action}</div> : null}
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
    <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-void/54 px-4 py-1.5 backdrop-blur-[34px]">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {backHref ? (
            <Link href={backHref} className="liquid-glass mt-0.5 grid size-9 shrink-0 place-items-center rounded-[18px] text-ink/70 transition active:scale-95" aria-label="Regresar al inicio">
              <ArrowLeft size={18} />
            </Link>
          ) : avatar ? (
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[18px] border border-volt/25 bg-volt/15 text-xs font-black text-volt shadow-[inset_0_1px_0_rgb(255_255_255_/_0.14)]">{avatar}</span>
          ) : null}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-volt/90">CLARVEX Team</p>
            <h1 className="text-[1.15rem] font-black leading-tight tracking-[-0.035em] text-ink">{title}</h1>
            <p className="text-[11px] leading-4 text-muted">{subtitle}</p>
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
  { href: "/comunicados", label: "Actividad", icon: ListChecks }
];

export function LiquidBottomNav() {
  const [homeHref, setHomeHref] = useState("/manager");
  const pathname = usePathname();

  useEffect(() => {
    getSession().then((session) => setHomeHref(session?.role === "ASESOR" ? "/advisor" : "/manager"));
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-2 z-30 px-3">
      <div className="liquid-glass pointer-events-auto mx-auto grid max-w-md grid-cols-5 gap-0.5 rounded-[28px] border-white/18 bg-card/35 p-1 shadow-[0_20px_64px_rgb(0_0_0_/_0.68),0_0_36px_rgb(34_197_94_/_0.05),inset_0_1px_0_rgb(255_255_255_/_0.24)] backdrop-blur-[40px]">
        {navItems.map((item) => {
          const href = item.href === "/manager" ? homeHref : item.href;
          const active = pathname === href || (item.href === "/manager" && (pathname === "/manager" || pathname === "/advisor"));
          return (
            <Link
              key={item.href}
              href={href}
              className="relative flex min-h-11 flex-col items-center justify-center rounded-[22px] text-[9px] font-bold text-muted transition hover:text-volt active:scale-95"
            >
              {active ? (
                <motion.span
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 rounded-[22px] border border-volt/35 bg-volt/18 shadow-[0_0_28px_rgb(34_197_94_/_0.24),inset_0_1px_0_rgb(255_255_255_/_0.26)]"
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <span className={cn("relative grid size-5 place-items-center", active && "text-volt")}>
                <item.icon size={17} />
              </span>
              <span className={cn("relative mt-0.5", active && "text-volt")}>{item.label}</span>
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
      className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-3"
    >
      {children}
    </motion.main>
  );
}

export function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className="liquid-glass group flex min-h-12 items-center gap-2.5 rounded-[22px] px-3 text-[13px] font-black tracking-[-0.01em] text-ink/90 transition active:scale-[0.98]">
      <span className="grid size-8 place-items-center rounded-[16px] border border-volt/20 bg-volt/12 text-volt shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)]">
        <Icon size={17} />
      </span>
      {label}
    </Link>
  );
}

export function FloatingActionButton({ href, icon: Icon = Plus, label }: { href: string; icon?: LucideIcon; label: string }) {
  return (
    <Link href={href} className="fixed bottom-20 right-4 z-20 flex min-h-12 items-center gap-2 rounded-full bg-volt px-4 text-sm font-black text-void shadow-[0_18px_44px_rgb(34_197_94_/_0.3),inset_0_1px_0_rgb(255_255_255_/_0.32)] transition active:scale-95">
      <Icon size={18} />
      {label}
    </Link>
  );
}

export const pageIcons = { CalendarDays, BookOpen, UserRound };
