"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BarChart3, BookOpen, CalendarDays, CheckSquare, ClipboardList, HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type ActionColor = "blue" | "green" | "purple" | "orange" | "pink";

interface Action {
  href: string;
  icon: LucideIcon;
  label: string;
  color: ActionColor;
}

const managerActions: Action[] = [
  { href: "/plan", icon: CheckSquare, label: "Crear plan del día", color: "blue" },
  { href: "/pendientes", icon: ClipboardList, label: "Crear pendiente", color: "green" },
  { href: "/bitacora", icon: BookOpen, label: "Bitácora", color: "purple" },
  { href: "/horarios", icon: CalendarDays, label: "Horarios", color: "orange" },
  { href: "/kudos", icon: HeartHandshake, label: "Reconocer", color: "pink" }
];

const advisorActions: Action[] = [
  { href: "/horarios", icon: CalendarDays, label: "Mis horarios", color: "orange" },
  { href: "/pendientes", icon: ClipboardList, label: "Pendientes", color: "blue" },
  { href: "/bitacora", icon: BookOpen, label: "Bitácora", color: "purple" },
  { href: "/kpis", icon: BarChart3, label: "Mis KPIs", color: "green" },
  { href: "/kudos", icon: HeartHandshake, label: "Reconocer", color: "pink" }
];

const colorMap: Record<ActionColor, string> = {
  blue: "bg-blue-50 dark:bg-blue-950/50 text-[#2563EB]",
  green: "bg-green-50 dark:bg-green-950/50 text-green-600 dark:text-green-500",
  purple: "bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-50 dark:bg-orange-950/50 text-orange-500",
  pink: "bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400"
};

interface QuickActionsProps {
  variant?: "manager" | "advisor";
  delay?: number;
}

export function QuickActions({ variant = "manager", delay = 0.30 }: QuickActionsProps) {
  const actions = variant === "manager" ? managerActions : advisorActions;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay }}
      className="grid grid-cols-2 gap-2.5"
    >
      {actions.map((action) => (
        <motion.div key={action.href} whileTap={{ scale: 0.97 }}>
          <Link
            href={action.href}
            className="flex min-h-[52px] items-center gap-2.5 rounded-[22px] border border-white/50 bg-white/75 px-3.5 py-3 backdrop-blur-2xl transition dark:border-slate-700/50 dark:bg-slate-800/60"
            style={{ boxShadow: "0 4px 16px rgba(15,23,42,0.05)" }}
          >
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-[14px]", colorMap[action.color])}>
              <action.icon size={16} />
            </span>
            <span className="text-[12.5px] font-black leading-snug tracking-[-0.01em] text-slate-700 dark:text-slate-200">
              {action.label}
            </span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
