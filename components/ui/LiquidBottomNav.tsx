"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Home,
  ListChecks,
  MessageSquare,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/manager", label: "Inicio", icon: Home },
  { href: "/plan", label: "Plan", icon: CheckSquare },
  { href: "/pendientes", label: "Pend.", icon: AlertTriangle },
  { href: "/chat", label: "Chat", icon: MessageSquare },
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
      <div className="liquid-glass pointer-events-auto mx-auto grid max-w-md grid-cols-6 gap-0.5 rounded-[30px] border-line/80 bg-card/90 dark:bg-panel/95 p-1.5 shadow-[0_14px_34px_rgb(15_23_42_/_0.14)] backdrop-blur-xl">
        {navItems.map((item) => {
          const href = item.href === "/manager" ? homeHref : item.href;
          const active = pathname === href || (item.href === "/manager" && (pathname === "/manager" || pathname === "/advisor")) || (item.href === "/chat" && pathname.startsWith("/chat"));
          return (
            <Link
              key={item.href}
              href={href}
              onClick={() => { if (!active) haptic("light"); }}
              aria-current={active ? "page" : undefined}
              className="tappable relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[22px]"
            >
              <span className="relative grid size-9 place-items-center">
                {active ? (
                  <motion.span
                    layoutId="bottom-nav-active"
                    className="absolute inset-0 rounded-[16px] bg-volt/14 ring-1 ring-volt/25 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]"
                    transition={{ type: "spring", stiffness: 480, damping: 34 }}
                  />
                ) : null}
                <motion.span
                  animate={{ scale: active ? 1.08 : 1, y: active ? -0.5 : 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 26 }}
                  className={cn("relative grid place-items-center transition-colors", active ? "icon-bold text-volt" : "text-muted")}
                >
                  <item.icon size={19} />
                </motion.span>
              </span>
              <span className={cn("relative text-[10px] tracking-[-0.01em] transition-colors", active ? "font-semibold text-volt" : "font-bold text-muted")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const BottomNav = LiquidBottomNav;
