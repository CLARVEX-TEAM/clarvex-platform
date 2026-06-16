"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Smartphone,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";

// Ancho mínimo para considerar "escritorio". Por debajo, gerencia usa la app móvil.
export const DESKTOP_MIN_WIDTH = 1024;

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/escritorio", label: "Dashboard", icon: LayoutDashboard },
  { href: "/escritorio/comunicados", label: "Comunicados", icon: Megaphone },
  { href: "/escritorio/pendientes", label: "Pendientes", icon: AlertTriangle },
  { href: "/escritorio/kpis", label: "KPIs", icon: BarChart3 },
  { href: "/escritorio/equipo", label: "Equipo", icon: UsersRound }
];

const sectionTitles: Record<string, { title: string; subtitle: string }> = {
  "/escritorio": { title: "Dashboard", subtitle: "Resumen operativo de la tienda" },
  "/escritorio/comunicados": { title: "Comunicados", subtitle: "Envía y administra comunicados del equipo" },
  "/escritorio/pendientes": { title: "Pendientes", subtitle: "Handover, responsables y fechas límite" },
  "/escritorio/kpis": { title: "KPIs", subtitle: "Venta, metas y desempeño del equipo" },
  "/escritorio/equipo": { title: "Equipo", subtitle: "Colaboradores y horarios" }
};

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // Guard de rol + tamaño: gerencia en pantalla grande. Si no, devolver a la app.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < DESKTOP_MIN_WIDTH) {
      router.replace("/manager");
      return;
    }
    getSession().then((session) => {
      if (!session) { router.replace("/login"); return; }
      if (session.role === "ASESOR") { router.replace("/advisor"); return; }
      setUser(session);
      setReady(true);
    });
  }, [router]);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const section = sectionTitles[pathname] ?? { title: "Escritorio", subtitle: "" };
  const roleLabel = user?.role === "GERENTE" ? "Gerente" : user?.role === "SUBGERENTE" ? "Subgerente" : "";

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm font-bold text-muted">Cargando escritorio…</div>;
  }

  return (
    <div className="flex min-h-screen">
      {/* ─── Barra lateral ─────────────────────────────────────────── */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-white/85 px-4 py-5 backdrop-blur-xl dark:bg-[#0f1729]/90">
        <Link href="/escritorio" className="flex items-center gap-2.5 px-2">
          <span className="grid size-10 place-items-center rounded-2xl bg-volt text-white shadow-[0_8px_20px_rgb(37_99_235_/_0.28)]">
            <LayoutDashboard size={20} />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-volt/90">CLARVEX</p>
            <p className="text-[15px] font-black tracking-[-0.02em] text-ink">Escritorio</p>
          </div>
        </Link>

        <nav className="mt-7 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/escritorio" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tappable relative flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold tracking-[-0.01em] transition-colors",
                  active ? "text-volt" : "text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800/60"
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="desktop-nav-active"
                    className="absolute inset-0 rounded-2xl bg-volt/12 ring-1 ring-volt/25"
                    transition={{ type: "spring", stiffness: 480, damping: 34 }}
                  />
                ) : null}
                <span className={cn("relative grid place-items-center", active && "icon-bold")}>
                  <item.icon size={19} />
                </span>
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Link href="/perfil" className="flex items-center gap-2.5 rounded-2xl px-1 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800/60">
            <ProfileAvatar name={user?.name ?? "Gerencia"} photoUrl={user?.photoUrl} size="sm" className="size-9 rounded-2xl shadow-none" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-black text-ink">{user?.name}</p>
              <p className="text-[11px] font-bold text-muted">{roleLabel}</p>
            </div>
          </Link>
          <Link href="/manager" className="tappable flex min-h-10 items-center gap-2.5 rounded-2xl px-3 text-[13px] font-bold text-muted transition hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800/60">
            <Smartphone size={16} /> Ver versión móvil
          </Link>
          <button onClick={() => void handleLogout()} className="tappable flex min-h-10 w-full items-center gap-2.5 rounded-2xl px-3 text-[13px] font-bold text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/30">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ─── Contenido ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-white/80 px-8 py-4 backdrop-blur-xl dark:bg-[#0f1729]/85">
          <h1 className="text-[1.45rem] font-black leading-tight tracking-[-0.03em] text-ink">{section.title}</h1>
          {section.subtitle ? <p className="text-sm text-muted">{section.subtitle}</p> : null}
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
