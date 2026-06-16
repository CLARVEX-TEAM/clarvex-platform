"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Cake, CalendarClock, Check, CheckCheck, ClipboardCheck, GraduationCap,
  HeartHandshake, ImagePlus, Megaphone, MessageCircle, PackageSearch, Sparkles, Trophy
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NotificationItem = { id: string; type: string; title: string; body: string; readAt: string | null; createdAt: string };

const typeIcon: Record<string, LucideIcon> = {
  PLAN_READY: ClipboardCheck,
  NEW_ANNOUNCEMENT: Megaphone,
  PENDING_ASSIGNED: Bell,
  TASK_COMPLETED: Check,
  KPI_GOAL_REACHED: Trophy,
  COMMENT_ADDED: MessageCircle,
  EVIDENCE_ADDED: ImagePlus,
  DAILY_SUMMARY: Sparkles,
  ANNOUNCEMENT_REACTION: Megaphone,
  CELEBRATION: Cake,
  KUDO: HeartHandshake,
  SHIFT_REQUEST: CalendarClock,
  INVENTORY_REPORT: PackageSearch,
  NEW_TRAINING: GraduationCap
};

// Destinos dentro del escritorio cuando existe equivalente; si no, a la app.
const typeHref: Record<string, string> = {
  NEW_ANNOUNCEMENT: "/escritorio/comunicados",
  ANNOUNCEMENT_REACTION: "/escritorio/comunicados",
  PENDING_ASSIGNED: "/escritorio/pendientes",
  NEW_TRAINING: "/escritorio/capacitacion",
  KPI_GOAL_REACHED: "/escritorio/kpis",
  DAILY_SUMMARY: "/escritorio/kpis"
};

export function DesktopNotifications() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    fetch("/api/notifications?limit=10", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ notifications?: NotificationItem[]; unreadCount?: number }>)
      .then((payload) => { setItems(payload.notifications ?? []); setUnread(payload.unreadCount ?? 0); })
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    const onUpdate = () => load();
    window.addEventListener("notifications-updated", onUpdate);
    return () => { clearInterval(id); window.removeEventListener("notifications-updated", onUpdate); };
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (open && ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function markRead(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnread((count) => Math.max(0, count - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
    window.dispatchEvent(new Event("notifications-updated"));
  }

  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
    window.dispatchEvent(new Event("notifications-updated"));
  }

  function openItem(item: NotificationItem) {
    if (!item.readAt) void markRead(item.id);
    setOpen(false);
    router.push(typeHref[item.type] ?? "/escritorio");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `${unread} notificaciones sin leer` : "Notificaciones"}
        className="tappable relative grid size-10 place-items-center rounded-2xl border border-line bg-panel text-ink/70 transition hover:text-volt"
      >
        <Bell size={18} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-3xl border border-line bg-white shadow-2xl dark:bg-[#1a2540]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-black text-ink">Notificaciones</p>
              {unread > 0 ? (
                <button onClick={() => void markAllRead()} className="flex items-center gap-1 text-xs font-bold text-volt hover:underline">
                  <CheckCheck size={14} /> Marcar todas
                </button>
              ) : null}
            </div>
            <div className="max-h-[26rem] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">Sin notificaciones.</p>
              ) : items.map((item) => {
                const Icon = typeIcon[item.type] ?? Bell;
                const unreadItem = !item.readAt;
                return (
                  <button
                    key={item.id}
                    onClick={() => openItem(item)}
                    className={cn("flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition last:border-b-0 hover:bg-panel", unreadItem && "bg-volt/[0.05]")}
                  >
                    <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-2xl", unreadItem ? "bg-volt/12 text-volt" : "bg-panel text-muted")}>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-black text-ink">{item.title}</span>
                        {unreadItem ? <span className="size-1.5 shrink-0 rounded-full bg-volt" /> : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-5 text-muted">{item.body}</span>
                      <span className="mt-1 block text-[11px] text-muted">{formatDate(item.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Link href="/escritorio/notificaciones" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-3 text-center text-xs font-bold text-volt transition hover:bg-panel">
              Ver todas las notificaciones
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
