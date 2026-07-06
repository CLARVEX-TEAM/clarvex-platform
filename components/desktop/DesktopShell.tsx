"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Database,
  Globe,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  MessageSquare,
  Moon,
  PackageSearch,
  Smartphone,
  Sun,
  Trophy,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";
import { useTheme } from "@/components/ThemeProvider";
import { DesktopChromeProvider, FreshnessPill } from "@/components/desktop/DesktopChrome";
import { DesktopNotifications } from "@/components/desktop/DesktopNotifications";
import { DesktopLock } from "@/components/desktop/DesktopLock";
import { consumeDesktopFreshLogin } from "@/lib/desktop-profiles";

// Ancho mínimo para considerar "escritorio". Por debajo, gerencia usa la app móvil.
export const DESKTOP_MIN_WIDTH = 1024;

const navGroups: { label: string; items: { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }[] }[] = [
  {
    label: "Operación",
    items: [
      { href: "/escritorio", label: "Dashboard", icon: LayoutDashboard },
      { href: "/escritorio/kpis", label: "KPIs", icon: BarChart3 },
      { href: "/escritorio/equipo", label: "Equipo", icon: UsersRound },
      { href: "/escritorio/horarios", label: "Horarios", icon: CalendarDays }
    ]
  },
  {
    label: "Día a día",
    items: [
      { href: "/escritorio/plan", label: "Plan del día", icon: ListChecks },
      { href: "/escritorio/pendientes", label: "Pendientes", icon: AlertTriangle },
      { href: "/escritorio/checklist", label: "Checklist", icon: CheckSquare },
      { href: "/escritorio/comunicados", label: "Comunicados", icon: Megaphone },
      { href: "/escritorio/chat", label: "Chat", icon: MessageSquare },
      { href: "/escritorio/bitacora", label: "Bitácora", icon: BookOpen }
    ]
  },
  {
    label: "Gestión",
    items: [
      { href: "/escritorio/solicitudes", label: "Solicitudes", icon: CalendarClock },
      { href: "/escritorio/faltantes", label: "Faltantes", icon: PackageSearch },
      { href: "/escritorio/kudos", label: "Reconocimientos", icon: HeartHandshake },
      { href: "/escritorio/encuestas", label: "Encuestas", icon: ClipboardCheck },
      { href: "/escritorio/capacitacion", label: "Capacitación", icon: GraduationCap },
      { href: "/escritorio/datos", label: "Centro de Datos", icon: Database },
      { href: "/mundial", label: "Mundial 2026", icon: Globe },
      { href: "/partido", label: "Partido México", icon: Trophy },
      { href: "/admin", label: "Administración", icon: Building2, adminOnly: true }
    ]
  }
];

const sectionTitles: Record<string, { title: string; subtitle: string }> = {
  "/escritorio": { title: "Dashboard", subtitle: "Resumen operativo de la tienda" },
  "/escritorio/comunicados": { title: "Comunicados", subtitle: "Envía y administra comunicados del equipo" },
  "/escritorio/pendientes": { title: "Pendientes", subtitle: "Handover, responsables y fechas límite" },
  "/escritorio/kpis": { title: "KPIs", subtitle: "Venta, metas y desempeño del equipo" },
  "/escritorio/equipo": { title: "Equipo", subtitle: "Colaboradores y horarios" },
  "/escritorio/horarios": { title: "Horarios", subtitle: "Agenda semanal del equipo" },
  "/escritorio/plan": { title: "Plan del día", subtitle: "Actividades y enfoque del equipo" },
  "/escritorio/checklist": { title: "Checklist de tienda", subtitle: "Apertura y cierre con evidencia" },
  "/escritorio/solicitudes": { title: "Solicitudes", subtitle: "Permisos, turnos y aprobaciones" },
  "/escritorio/faltantes": { title: "Faltantes", subtitle: "Inventario y reportes de producto" },
  "/escritorio/kudos": { title: "Reconocimientos", subtitle: "Reconoce el buen trabajo del equipo" },
  "/escritorio/encuestas": { title: "Encuestas", subtitle: "Clima laboral y feedback del equipo" },
  "/escritorio/datos": { title: "Centro de Datos", subtitle: "Fuentes RDV y sincronización" },
  "/escritorio/bitacora": { title: "Bitácora", subtitle: "Registro cronológico de operación de tienda" },
  "/escritorio/capacitacion": { title: "Capacitación", subtitle: "Biblioteca de recursos y archivos del equipo" },
  "/escritorio/chat": { title: "Chat", subtitle: "Mensajes directos y del equipo" },
  "/escritorio/notificaciones": { title: "Notificaciones", subtitle: "Avisos del equipo" },
  "/escritorio/perfil": { title: "Mi perfil", subtitle: "Tus datos y preferencias" }
};

// Sesión desbloqueada cacheada a nivel de módulo. Sobrevive a la navegación
// entre páginas del escritorio (mismo contexto JS, aunque el layout se remonte)
// pero se reinicia al recargar o abrir de nuevo (contexto JS nuevo). Así el PIN
// se pide al abrir/recargar, NO al cambiar de pestaña dentro del escritorio.
let unlockedSession: User | null = null;

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(unlockedSession);
  const [checking, setChecking] = useState(unlockedSession === null);
  const [unlocked, setUnlocked] = useState(unlockedSession !== null);

  // Guard de tamaño + bloqueo diario. El escritorio se bloquea en cada apertura
  // y pide PIN (login estilo Netflix). Solo se omite justo tras un login explícito
  // en /login (token de un solo uso) o si ya se desbloqueó en esta sesión de pestaña.
  useEffect(() => {
    if (unlockedSession) return; // ya desbloqueado en esta sesión: no re-bloquear al navegar
    if (typeof window !== "undefined" && window.innerWidth < DESKTOP_MIN_WIDTH) {
      router.replace("/manager");
      return;
    }
    if (consumeDesktopFreshLogin()) {
      getSession().then((session) => {
        if (session && session.role !== "ASESOR") {
          unlockedSession = session;
          setUser(session);
          setUnlocked(true);
        }
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, [router]);

  function handleUnlock(unlockedUser: User) {
    if (unlockedUser.role === "ASESOR") {
      router.replace("/advisor");
      return;
    }
    unlockedSession = unlockedUser;
    setUser(unlockedUser);
    setUnlocked(true);
  }

  function relock() {
    unlockedSession = null;
    setUser(null);
    setUnlocked(false);
  }

  async function handleLogout() {
    unlockedSession = null;
    await logout();
    router.push("/login");
  }

  const section = sectionTitles[pathname] ?? { title: "Escritorio", subtitle: "" };
  const roleLabel = user?.role === "GERENTE" ? "Gerente" : user?.role === "SUBGERENTE" ? "Subgerente" : "";
  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  if (checking) {
    return <div className="grid min-h-screen place-items-center text-sm font-bold text-muted">Cargando escritorio…</div>;
  }

  if (!unlocked || !user) {
    return <DesktopLock onUnlock={handleUnlock} />;
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

        <nav className="mt-6 flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {navGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted/70">{group.label}</p>
              {group.items.filter((item) => !item.adminOnly || user?.platformAdmin).map((item) => {
                const active = pathname === item.href || (item.href !== "/escritorio" && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "tappable relative flex min-h-10 items-center gap-3 rounded-2xl px-3 text-[13.5px] font-bold tracking-[-0.01em] transition-colors",
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
                      <item.icon size={18} />
                    </span>
                    <span className="relative">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <Link href="/escritorio/perfil" className="flex items-center gap-2.5 rounded-2xl px-1 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800/60">
            <ProfileAvatar name={user?.name ?? "Gerencia"} photoUrl={user?.photoUrl} size="sm" className="size-9 rounded-2xl shadow-none" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-black text-ink">{user?.name}</p>
              <p className="text-[11px] font-bold text-muted">{roleLabel}</p>
            </div>
          </Link>
          <Link href="/manager" className="tappable flex min-h-10 items-center gap-2.5 rounded-2xl px-3 text-[13px] font-bold text-muted transition hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800/60">
            <Smartphone size={16} /> Ver versión móvil
          </Link>
          <button onClick={relock} className="tappable flex min-h-10 w-full items-center gap-2.5 rounded-2xl px-3 text-[13px] font-bold text-muted transition hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-800/60">
            <UsersRound size={16} /> Cambiar de usuario
          </button>
          <button onClick={() => void handleLogout()} className="tappable flex min-h-10 w-full items-center gap-2.5 rounded-2xl px-3 text-[13px] font-bold text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/30">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ─── Contenido ─────────────────────────────────────────────── */}
      <DesktopChromeProvider>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line bg-white/80 px-8 py-3.5 backdrop-blur-xl dark:bg-[#0f1729]/85">
            <div className="min-w-0">
              <h1 className="text-[1.4rem] font-black leading-tight tracking-[-0.03em] text-ink">{section.title}</h1>
              {section.subtitle ? <p className="truncate text-sm text-muted">{section.subtitle}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right xl:block">
                {user?.storeName ? <p className="text-sm font-black leading-tight text-ink">{user.storeName}</p> : null}
                <p className="text-[11px] capitalize text-muted">{todayLabel}</p>
              </div>
              <FreshnessPill />
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
                className="tappable grid size-10 place-items-center rounded-2xl border border-line bg-panel text-ink/70 transition hover:text-volt"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <DesktopNotifications />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-6">
            {children}
            <p className="pt-8 text-center text-[11px] font-semibold text-muted/70">
              © {new Date().getFullYear()} CLARVEX · Jesús Adrián Hernández Luna. Todos los derechos reservados.
            </p>
          </main>
        </div>
      </DesktopChromeProvider>
    </div>
  );
}
