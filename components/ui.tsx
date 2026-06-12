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
  mint: "text-success",
  ember: "text-ember",
  orchid: "text-orchid",
  purple: "text-purple",
  sky: "text-sky"
};

const accentBg: Record<Accent, string> = {
  volt: "bg-volt",
  mint: "bg-success",
  ember: "bg-ember",
  orchid: "bg-orchid",
  purple: "bg-purple",
  sky: "bg-sky"
};

const badgeTones: Record<Tone, string> = {
  default: "border-line bg-slate-50 dark:bg-slate-800 text-muted",
  success: "border-success/25 bg-success/10 text-success",
  done: "border-success/25 bg-success/10 text-success",
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
      className={cn("liquid-glass rounded-[28px] p-3.5 shadow-glass", className)}
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
        variant === "primary" && "bg-volt text-white shadow-[0_8px_20px_rgb(37_99_235_/_0.22)] hover:bg-[#1D4ED8]",
        variant === "glass" && "liquid-glass text-ink hover:text-volt",
        variant === "ghost" && "bg-slate-100 dark:bg-slate-800 text-ink hover:bg-blue-50 dark:hover:bg-slate-700",
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
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-[#2a3a5c]">
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
    <div className="relative grid place-items-center rounded-full bg-blue-50 dark:bg-[#1a2540]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-200 dark:text-[#2a3a5c]" />
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
        {icon ? <span className={cn("grid place-items-center border border-line bg-blue-50 dark:bg-[#1a2540]", compact ? "size-7 rounded-[14px]" : "size-9 rounded-[18px]", accentText[tone])}>{icon}</span> : null}
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
            className={cn("w-full rounded-full bg-slate-200 dark:bg-[#2a3a5c]", index >= 3 && accentBg[tone])}
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
  action,
  author,
  imageUrl
}: {
  title: string;
  body: string;
  meta?: string;
  unread?: boolean;
  action?: React.ReactNode;
  author?: { name: string; photoUrl?: string | null };
  imageUrl?: string | null;
}) {
  return (
    <GlassCard className={cn("p-3", unread && "border-volt/35 bg-volt/[0.055]")}>
      <div className="flex items-start gap-2.5">
        {author ? <ProfileAvatar name={author.name} photoUrl={author.photoUrl} size="sm" className="size-9 rounded-full shadow-none" /> : <span className={cn("grid size-9 shrink-0 place-items-center rounded-[16px] border border-line", unread ? "bg-volt/10 text-volt" : "bg-slate-100 dark:bg-[#1a2540] text-muted")}><Bell size={16} /></span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-black leading-5 tracking-[-0.02em] text-ink">{title}</h2>
              {meta ? <p className="mt-0.5 text-[11px] text-muted">{meta}</p> : null}
            </div>
            <StatusBadge tone={unread ? "success" : "default"}>{unread ? "nuevo" : "leido"}</StatusBadge>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted">{body}</p>
          {imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="mt-2.5 block overflow-hidden rounded-2xl border border-line">
              <Image src={imageUrl} alt="Imagen del comunicado" width={800} height={400} className="w-full object-cover" />
            </a>
          ) : null}
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
  avatar,
  photoUrl,
  profileName
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  backHref?: string;
  avatar?: string;
  photoUrl?: string | null;
  profileName?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-white/80 dark:bg-[#0f1729]/95 px-4 py-1.5 shadow-[0_4px_16px_rgb(15_23_42_/_0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {backHref ? (
            <Link href={backHref} className="liquid-glass mt-0.5 grid size-9 shrink-0 place-items-center rounded-[18px] text-ink/70 transition active:scale-95" aria-label="Regresar al inicio">
              <ArrowLeft size={18} />
            </Link>
          ) : avatar || photoUrl ? (
            <Link href="/perfil" aria-label="Abrir mi perfil" className="mt-0.5 shrink-0 transition active:scale-95">
              <ProfileAvatar name={profileName ?? avatar ?? "Usuario"} photoUrl={photoUrl} size="sm" className="size-9 rounded-[18px] shadow-none" />
            </Link>
          ) : null}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-volt/90">CLARVEX Team</p>
            <h1 className="text-[1.15rem] font-black leading-tight tracking-[-0.035em] text-ink">{title}</h1>
            <p className="text-[11px] leading-4 text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <NotificationBell />
          {action}
        </div>
      </div>
    </header>
  );
}

function NotificationBell() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadCount = () => fetch("/api/notifications?limit=1", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ unreadCount: number }> : { unreadCount: 0 })
      .then((payload) => setUnreadCount(payload.unreadCount))
      .catch(() => setUnreadCount(0));
    void loadCount();
    window.addEventListener("notifications-updated", loadCount);
    return () => window.removeEventListener("notifications-updated", loadCount);
  }, [pathname]);

  return (
    <Link href="/notificaciones" aria-label={unreadCount ? `${unreadCount} notificaciones no leidas` : "Abrir notificaciones"} className="liquid-glass relative grid size-11 place-items-center rounded-[22px] text-ink/62 transition active:scale-95">
      <Bell size={18} />
      {unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </Link>
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
      <div className="liquid-glass pointer-events-auto mx-auto grid max-w-md grid-cols-5 gap-0.5 rounded-[28px] border-line/80 bg-white/88 dark:bg-[#1a2540]/95 p-1 shadow-[0_12px_30px_rgb(15_23_42_/_0.12)] backdrop-blur-xl">
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
                  className="absolute inset-0 rounded-[22px] bg-blue-50 dark:bg-[#1a2540] ring-1 ring-volt/20"
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

export function QuickLink({ href, icon: Icon, label, className = "" }: { href: string; icon: LucideIcon; label: string; className?: string }) {
  return (
    <Link href={href} className={cn("liquid-glass group flex min-h-12 items-center gap-2.5 rounded-[22px] px-3 text-[13px] font-black tracking-[-0.01em] text-ink/90 transition active:scale-[0.98]", className)}>
      <span className="grid size-8 place-items-center rounded-[16px] border border-volt/20 bg-volt/12 text-volt shadow-[inset_0_1px_0_rgb(255_255_255_/_0.12)]">
        <Icon size={17} />
      </span>
      {label}
    </Link>
  );
}

export function FloatingActionButton({ href, icon: Icon = Plus, label }: { href: string; icon?: LucideIcon; label: string }) {
  return (
    <Link href={href} className="fixed bottom-20 right-4 z-20 flex min-h-12 items-center gap-2 rounded-full bg-volt px-4 text-sm font-black text-white shadow-[0_8px_20px_rgb(37_99_235_/_0.24)] transition active:scale-95">
      <Icon size={18} />
      {label}
    </Link>
  );
}

export const pageIcons = { CalendarDays, BookOpen, UserRound };
