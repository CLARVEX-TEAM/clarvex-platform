"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Cake, CalendarClock, Check, CheckCheck, ClipboardCheck, GraduationCap,
  HeartHandshake, ImagePlus, Megaphone, MessageCircle, PackageSearch, Sparkles, Trophy
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState } from "@/components/ui";

type NotificationItem = { id: string; type: string; title: string; body: string; readAt: string | null; createdAt: string };

const typeMeta: Record<string, { label: string; icon: LucideIcon }> = {
  PLAN_READY: { label: "Plan", icon: ClipboardCheck },
  NEW_ANNOUNCEMENT: { label: "Comunicado", icon: Megaphone },
  PENDING_ASSIGNED: { label: "Pendiente", icon: Bell },
  TASK_COMPLETED: { label: "Tarea", icon: Check },
  KPI_GOAL_REACHED: { label: "Meta KPI", icon: Trophy },
  COMMENT_ADDED: { label: "Comentario", icon: MessageCircle },
  EVIDENCE_ADDED: { label: "Evidencia", icon: ImagePlus },
  DAILY_SUMMARY: { label: "Resumen", icon: Sparkles },
  ANNOUNCEMENT_REACTION: { label: "Reacción", icon: Megaphone },
  CELEBRATION: { label: "Festejo", icon: Cake },
  KUDO: { label: "Reconocimiento", icon: HeartHandshake },
  SHIFT_REQUEST: { label: "Solicitud", icon: CalendarClock },
  INVENTORY_REPORT: { label: "Inventario", icon: PackageSearch },
  NEW_TRAINING: { label: "Capacitación", icon: GraduationCap }
};

const typeHref: Record<string, string> = {
  NEW_ANNOUNCEMENT: "/escritorio/comunicados",
  ANNOUNCEMENT_REACTION: "/escritorio/comunicados",
  PENDING_ASSIGNED: "/escritorio/pendientes",
  NEW_TRAINING: "/escritorio/capacitacion",
  KPI_GOAL_REACHED: "/escritorio/kpis",
  DAILY_SUMMARY: "/escritorio/kpis",
  COMMENT_ADDED: "/escritorio/bitacora",
  EVIDENCE_ADDED: "/escritorio/bitacora"
};

export default function EscritorioNotificaciones() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/notifications?limit=100", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ notifications?: NotificationItem[]; unreadCount?: number }>)
      .then((payload) => { setItems(payload.notifications ?? []); setUnread(payload.unreadCount ?? 0); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

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
    router.push(typeHref[item.type] ?? "/escritorio");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-muted">{unread ? `${unread} sin leer` : "Todo al día"}</p>
        {unread > 0 ? <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => void markAllRead()}><CheckCheck size={16} /> Marcar todas</Button> : null}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-3xl bg-slate-200 dark:bg-slate-800" />)}</div>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={Bell} title="Sin notificaciones" description="Aquí aparecerán comunicados, pendientes y avisos del equipo." /></Card>
      ) : (
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const meta = typeMeta[item.type] ?? { label: "Aviso", icon: Bell };
            const Icon = meta.icon;
            const unreadItem = !item.readAt;
            return (
              <motion.div key={item.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Card onClick={() => openItem(item)} className={cn("cursor-pointer p-4", unreadItem && "ring-1 ring-volt/20")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", unreadItem ? "bg-volt/12 text-volt" : "bg-panel text-muted")}>
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-sm font-semibold text-ink">{item.title}</h2>
                        <Badge tone={unreadItem ? "info" : "default"}>{unreadItem ? meta.label : "Leída"}</Badge>
                      </div>
                      <p className="mt-1.5 text-sm leading-5 text-muted">{item.body}</p>
                      <p className="mt-1 text-[11px] text-muted">{formatDate(item.createdAt)}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
