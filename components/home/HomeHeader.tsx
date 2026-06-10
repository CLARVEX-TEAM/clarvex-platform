"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Bell, LogOut } from "lucide-react";
import type { Role } from "@/lib/types";

const roleLabel: Record<Role, string> = {
  GERENTE: "Gerente",
  SUBGERENTE: "Subgerente",
  ASESOR: "Asesor"
};

interface HomeHeaderProps {
  name: string;
  role: Role;
  photoUrl?: string | null;
  storeName?: string;
  onLogout: () => void;
}

export function HomeHeader({ name, role, photoUrl, storeName, onLogout }: HomeHeaderProps) {
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
    <header className="sticky top-0 z-20 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/88 dark:bg-slate-950/95 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/perfil" aria-label="Mi perfil" className="shrink-0 transition active:scale-95">
            <div
              className="relative size-12 overflow-hidden rounded-full"
              style={{ boxShadow: "0 0 0 2px rgba(37,99,235,0.18), 0 0 0 4px rgba(37,99,235,0.07), 0 4px 14px rgba(37,99,235,0.16)" }}
            >
              {photoUrl ? (
                <Image src={photoUrl} alt={name} fill sizes="48px" className="object-cover" />
              ) : (
                <span className="grid size-full place-items-center rounded-full bg-[#2563EB] text-base font-black text-white">
                  {firstName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
          </Link>
          <div className="min-w-0">
            <h1 className="text-[1.1rem] font-black leading-snug tracking-[-0.03em] text-slate-900 dark:text-white">
              Hola, {firstName} 👋
            </h1>
            <p className="truncate text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
              {roleLabel[role]}{storeName ? ` · ${storeName}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/notificaciones"
            aria-label={unreadCount ? `${unreadCount} notificaciones` : "Notificaciones"}
            className="relative grid size-10 place-items-center rounded-[20px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition active:scale-95"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[8.5px] font-black leading-4 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <button
            onClick={onLogout}
            className="grid size-10 place-items-center rounded-[20px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 transition active:scale-95"
            aria-label="Cerrar sesión"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
