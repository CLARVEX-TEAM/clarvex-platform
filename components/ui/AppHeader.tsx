"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { rutaDeInicio } from "@/lib/puente-nativo";
import { cn } from "@/lib/utils";
import { GradientText } from "@/components/magic/GradientText";
import { ProfileAvatar } from "./ProfileAvatar";

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
    <div className="relative shrink-0">
      <Link href="/notificaciones" aria-label={unreadCount ? `${unreadCount} notificaciones no leidas` : "Abrir notificaciones"} className="tappable solid-card grid size-11 place-items-center rounded-[22px] text-ink/62">
        <Bell size={18} />
      </Link>
      {unreadCount > 0 ? (
        <span className="pointer-events-none absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-orchid px-[5px] text-[10px] font-semibold leading-none text-white shadow-xs ring-2 ring-card dark:ring-void">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </div>
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
  // Se eleva y se condensa al hacer scroll (sensación nativa).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "app-header pt-safe sticky top-(--matchday-offset,0px) z-20 border-b bg-card/85 dark:bg-void/95 px-4 backdrop-blur-xl transition-all duration-300",
        scrolled
          ? "border-line pb-1 shadow-[0_8px_24px_rgb(15_23_42/0.1)]"
          : "border-line/80 pb-2 shadow-[0_4px_16px_rgb(15_23_42/0.04)]"
      )}
      style={{ ["--pt-safe-base" as string]: scrolled ? "0.25rem" : "0.5rem" }}
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {backHref ? (
            /*
              ⚠️ `rutaDeInicio` traduce `/manager` y `/advisor` a «Mi día»
              dentro de la APK. Se hace AQUÍ y no en las siete pantallas que lo
              piden: así la próxima que escriba `backHref="/manager"` queriendo
              decir «al inicio» tampoco saca al usuario a la portada de la web.
            */
            <Link href={rutaDeInicio(backHref)} className="tappable solid-card mt-0.5 grid size-9 shrink-0 place-items-center rounded-[18px] text-ink/70" aria-label="Regresar al inicio">
              <ArrowLeft size={18} />
            </Link>
          ) : avatar || photoUrl ? (
            <Link href="/perfil" aria-label="Abrir mi perfil" className="mt-0.5 shrink-0 transition active:scale-95">
              <ProfileAvatar name={profileName ?? avatar ?? "Usuario"} photoUrl={photoUrl} size="sm" className="size-9 rounded-[18px] shadow-none" />
            </Link>
          ) : null}
          <div className="min-w-0">
            <p className={cn("app-header-eyebrow font-bold uppercase tracking-[0.16em] text-volt/90 transition-all duration-300", scrolled ? "text-[9px] opacity-70" : "text-[10px] opacity-100")}>CLARVEX Team</p>
            <h1 className="app-header-title text-[1.15rem] font-semibold leading-tight tracking-[-0.035em] text-ink">
              <GradientText>{title}</GradientText>
            </h1>
            <p className={cn("app-header-sub overflow-hidden text-[11px] leading-4 text-muted transition-all duration-300", scrolled ? "max-h-0 opacity-0" : "max-h-5 opacity-100")}>{subtitle}</p>
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
