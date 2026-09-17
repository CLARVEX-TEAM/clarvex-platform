"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Cake, CalendarClock, Check, CheckCheck, ClipboardCheck, GraduationCap,
  HeartHandshake, ImagePlus, Megaphone, MessageCircle, PackageSearch, Sparkles, Trophy
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { DeskButton, DeskEmpty, DeskSkeleton } from "@/components/desktop/DeskUI";
import { AnimatedList } from "@/components/magic/AnimatedList";

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
  NEW_TRAINING: { label: "Capacitación", icon: GraduationCap },
  CHECKLIST_REMINDER: { label: "Checklist", icon: ClipboardCheck }
};

const typeHref: Record<string, string> = {
  NEW_ANNOUNCEMENT: "/escritorio/comunicados",
  ANNOUNCEMENT_REACTION: "/escritorio/comunicados",
  PENDING_ASSIGNED: "/escritorio/pendientes",
  NEW_TRAINING: "/escritorio/capacitacion",
  KPI_GOAL_REACHED: "/escritorio/kpis",
  DAILY_SUMMARY: "/escritorio/kpis",
  COMMENT_ADDED: "/escritorio/bitacora",
  EVIDENCE_ADDED: "/escritorio/bitacora",
  CHECKLIST_REMINDER: "/checklist"
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
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-ui text-muted">{unread ? `${unread} sin leer` : "Todo al día"}</p>
        {unread > 0 ? (
          <DeskButton onClick={() => void markAllRead()}>
            <CheckCheck size={15} /> Marcar todas
          </DeskButton>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <DeskSkeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <DeskEmpty
          icon={Bell}
          title="Sin notificaciones"
          hint="Aquí llegan los comunicados, los pendientes que te asignan y los avisos del equipo."
        />
      ) : (
        // AnimatedList escalona solo los primeros ocho: nadie ve entrar el
        // número treinta, pero el navegador sí pagaría por animarlo.
        <AnimatedList className="space-y-3">
          {items.map((item) => {
            const meta = typeMeta[item.type] ?? { label: "Aviso", icon: Bell };
            const Icon = meta.icon;
            const unreadItem = !item.readAt;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openItem(item)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-line-strong",
                  unreadItem ? "border-accent/35" : "border-line"
                )}
              >
                <span className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  unreadItem ? "bg-accent/15 text-accent" : "bg-panel text-muted"
                )}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-ui font-semibold text-ink">{item.title}</span>
                    <Badge tone={unreadItem ? "info" : "default"}>{unreadItem ? meta.label : "Leída"}</Badge>
                  </span>
                  <span className="mt-1.5 block text-ui leading-5 text-muted">{item.body}</span>
                  <span className="mt-1 block text-caption text-muted">{formatDate(item.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </AnimatedList>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
