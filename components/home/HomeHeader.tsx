"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Bell, LogOut } from "lucide-react";
import { photoSrc } from "@/lib/photo-src";
import type { Role } from "@/lib/types";
import { timeGreeting } from "@/lib/greeting";

const roleLabel: Record<Role, string> = {
  GERENTE: "Gerente",
  SUBGERENTE: "Subgerente",
  ASESOR: "Asesor",
  REGIONAL: "Dir. Regional"
};

interface HomeHeaderProps {
  name: string;
  role: Role;
  photoUrl?: string | null;
  storeName?: string;
  lastUpdated?: Date | null;
  onLogout: () => void;
}

export function HomeHeader({ name, role, photoUrl, storeName, lastUpdated, onLogout }: HomeHeaderProps) {
  const firstName = name.split(" ")[0];
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch("/api/notifications?limit=1", { cache: "no-store" })
        .then(async (res) => (res.ok ? (res.json() as Promise<{ unreadCount: number }>) : { unreadCount: 0 }))
        .then((p) => setUnreadCount(p.unreadCount))
        .catch(() => {});
    void load();
    window.addEventListener("notifications-updated", load);
    return () => window.removeEventListener("notifications-updated", load);
  }, [pathname]);

  return (
    <header className="pt-safe sticky top-(--matchday-offset,0px) z-20 border-b border-line bg-void/85 px-4 pb-3 backdrop-blur-xl" style={{ ["--pt-safe-base" as string]: "0.75rem" }}>
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/perfil" aria-label="Mi perfil" className="shrink-0 transition active:scale-95">
            <div className="relative size-11 overflow-hidden rounded-full ring-1 ring-line">
              {photoSrc(photoUrl) ? (
                <Image src={photoSrc(photoUrl)!} alt={name} fill sizes="44px" className="object-cover" unoptimized />
              ) : (
                <span className="grid size-full place-items-center rounded-full bg-linear-to-b from-slate-700 to-slate-900 text-sm font-semibold text-white">
                  {firstName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{timeGreeting()}</p>
            <h1 className="text-[1.05rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
              {firstName}
            </h1>
            <p className="truncate text-[11.5px] text-muted">
              {roleLabel[role]}{storeName ? ` · ${storeName}` : ""}
              {lastUpdated ? ` · Actualizado ${lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/notificaciones"
            aria-label={unreadCount ? `${unreadCount} notificaciones` : "Notificaciones"}
            className="relative grid size-9 place-items-center rounded-full border border-line bg-card text-muted transition active:scale-95"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-orchid px-1 text-[8.5px] font-semibold leading-4 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <button
            onClick={onLogout}
            className="grid size-9 place-items-center rounded-full border border-line bg-card text-muted transition active:scale-95"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
