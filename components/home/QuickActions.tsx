"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BarChart3, BookOpen, Boxes, CalendarClock, CalendarDays, CheckSquare, ClipboardCheck, ClipboardList, Clock, CreditCard, GraduationCap, HeartHandshake, PackageSearch, Shirt, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// El color se conserva en los datos pero el rediseño minimalista usa iconos
// neutros — el color ya no decora cada acción.
type ActionColor = "blue" | "green" | "purple" | "orange" | "pink" | "amber";

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
  { href: "/kudos", icon: HeartHandshake, label: "Reconocer", color: "pink" },
  { href: "/asistencia", icon: Clock, label: "Asistencia", color: "amber" },
  { href: "/uniformes", icon: Shirt, label: "Uniformes", color: "pink" },
  { href: "/solicitudes", icon: CalendarClock, label: "Días y cambios", color: "blue" },
  { href: "/faltantes", icon: PackageSearch, label: "Faltantes", color: "orange" },
  { href: "/capacitacion", icon: GraduationCap, label: "Capacitación", color: "purple" },
  { href: "/encuestas", icon: ClipboardCheck, label: "Encuestas", color: "green" },
  { href: "/conteos", icon: Boxes, label: "Conteos", color: "blue" },
  { href: "/suscripcion", icon: CreditCard, label: "Suscripción", color: "green" },
  { href: "/mundial", icon: Trophy, label: "Mundial 2026", color: "purple" }
];

const advisorActions: Action[] = [
  { href: "/horarios", icon: CalendarDays, label: "Mis horarios", color: "orange" },
  { href: "/pendientes", icon: ClipboardList, label: "Pendientes", color: "blue" },
  { href: "/kpis", icon: BarChart3, label: "Mis KPIs", color: "green" },
  { href: "/kudos", icon: HeartHandshake, label: "Reconocer", color: "pink" },
  { href: "/asistencia", icon: Clock, label: "Mi asistencia", color: "amber" },
  { href: "/uniformes", icon: Shirt, label: "Uniformes", color: "pink" },
  { href: "/solicitudes", icon: CalendarClock, label: "Días y cambios", color: "blue" },
  { href: "/faltantes", icon: PackageSearch, label: "Faltantes", color: "orange" },
  { href: "/capacitacion", icon: GraduationCap, label: "Capacitación", color: "purple" },
  { href: "/encuestas", icon: ClipboardCheck, label: "Encuestas", color: "green" },
  { href: "/conteos", icon: Boxes, label: "Conteos", color: "blue" },
  { href: "/mundial", icon: Trophy, label: "Mundial 2026", color: "purple" }
];

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
        <motion.div key={action.href} whileTap={{ scale: 0.985 }}>
          <Link
            href={action.href}
            className="card-3d flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-line bg-card px-3.5 py-3 transition hover:border-muted/50"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-void text-ink/65">
              <action.icon size={16} />
            </span>
            <span className="text-[12.5px] font-medium leading-snug tracking-[-0.01em] text-ink/85">
              {action.label}
            </span>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
