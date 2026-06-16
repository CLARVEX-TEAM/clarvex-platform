"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Cake, CalendarClock, Check, CheckCheck, ChevronRight, ClipboardCheck, GraduationCap, HeartHandshake, ImagePlus, Megaphone, MessageCircle, PackageSearch, Sparkles, Target, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card } from "@/components/ui";

type NotificationType = "PLAN_READY" | "NEW_ANNOUNCEMENT" | "PENDING_ASSIGNED" | "TASK_COMPLETED" | "KPI_GOAL_REACHED" | "COMMENT_ADDED" | "EVIDENCE_ADDED" | "DAILY_SUMMARY" | "ANNOUNCEMENT_REACTION" | "CELEBRATION" | "KUDO" | "SHIFT_REQUEST" | "INVENTORY_REPORT" | "NEW_TRAINING";
type NotificationItem = { id: string; type: NotificationType; title: string; body: string; readAt: string | null; createdAt: string };

type TypeConfig = { label: string; icon: typeof Bell; tone: "default" | "warn" | "danger" | "success" };

const typeConfig: Record<NotificationType, TypeConfig> = {
  PLAN_READY: { label: "Plan", icon: ClipboardCheck, tone: "default" },
  NEW_ANNOUNCEMENT: { label: "Comunicado", icon: Megaphone, tone: "warn" },
  PENDING_ASSIGNED: { label: "Pendiente", icon: Bell, tone: "danger" },
  TASK_COMPLETED: { label: "Tarea", icon: Check, tone: "success" },
  KPI_GOAL_REACHED: { label: "Meta KPI", icon: Trophy, tone: "success" },
  COMMENT_ADDED: { label: "Comentario", icon: MessageCircle, tone: "default" },
  EVIDENCE_ADDED: { label: "Evidencia", icon: ImagePlus, tone: "success" },
  DAILY_SUMMARY: { label: "Resumen", icon: Sparkles, tone: "success" },
  ANNOUNCEMENT_REACTION: { label: "Reacción", icon: Megaphone, tone: "warn" },
  CELEBRATION: { label: "Festejo", icon: Cake, tone: "warn" },
  KUDO: { label: "Reconocimiento", icon: HeartHandshake, tone: "success" },
  SHIFT_REQUEST: { label: "Solicitud", icon: CalendarClock, tone: "warn" },
  INVENTORY_REPORT: { label: "Inventario", icon: PackageSearch, tone: "danger" },
  NEW_TRAINING: { label: "Capacitación", icon: GraduationCap, tone: "success" }
};

// Fallback para cualquier tipo desconocido (evita crashes si se agregan tipos nuevos en el backend).
const fallbackConfig: TypeConfig = { label: "Aviso", icon: Bell, tone: "default" };

const typeHref: Record<NotificationType, string> = {
  PLAN_READY: "/plan",
  NEW_ANNOUNCEMENT: "/comunicados",
  PENDING_ASSIGNED: "/pendientes",
  TASK_COMPLETED: "/plan",
  KPI_GOAL_REACHED: "/kpis",
  COMMENT_ADDED: "/bitacora",
  EVIDENCE_ADDED: "/bitacora",
  DAILY_SUMMARY: "/kpis",
  ANNOUNCEMENT_REACTION: "/comunicados",
  CELEBRATION: "/notificaciones",
  KUDO: "/kudos",
  SHIFT_REQUEST: "/solicitudes",
  INVENTORY_REPORT: "/faltantes",
  NEW_TRAINING: "/capacitacion",
};

export default function NotificationsPage() {
  const [session, setSession] = useState<User | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const homeHref = session?.role === "ASESOR" ? "/advisor" : "/manager";

  useEffect(() => { getSession().then(setSession); }, []);
  useEffect(() => { void loadNotifications(); }, []);

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json() as { notifications?: NotificationItem[]; unreadCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar las notificaciones.");
      setItems(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    if (!response.ok) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    window.dispatchEvent(new Event("notifications-updated"));
  }

  async function markAllRead() {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    if (!response.ok) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    window.dispatchEvent(new Event("notifications-updated"));
  }

  return (
    <>
      <AppHeader title="Notificaciones" subtitle={unreadCount ? `${unreadCount} pendientes por revisar.` : "Todo esta al dia."} backHref={homeHref} action={unreadCount ? <Button type="button" variant="ghost" onClick={markAllRead} className="min-h-11 px-3" aria-label="Marcar todas como leidas"><CheckCheck size={17} /></Button> : null} />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {loading ? <Card className="text-sm font-semibold text-muted">Cargando notificaciones...</Card> : items.length === 0 ? <Card className="py-8 text-center"><Target className="mx-auto text-volt" size={28} /><h2 className="mt-3 font-black text-ink">Sin notificaciones</h2><p className="mt-1 text-sm text-muted">Los planes, comunicados y pendientes apareceran aqui.</p></Card> : <div className="space-y-2.5">{items.map((item) => <NotificationRow key={item.id} item={item} onRead={markRead} />)}</div>}
      </AppFrame>
      <BottomNav />
    </>
  );
}

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: (id: string) => void }) {
  const router = useRouter();
  const config = typeConfig[item.type] ?? fallbackConfig;
  const Icon = config.icon;

  function handleClick() {
    if (!item.readAt) onRead(item.id);
    router.push(typeHref[item.type] ?? "/notificaciones");
  }

  return (
    <Card
      onClick={handleClick}
      className={`cursor-pointer ${item.readAt ? "p-3.5" : "bg-blue-50/70 dark:bg-blue-950/30 p-3.5 ring-1 ring-volt/15"}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white dark:bg-slate-700 text-volt shadow-sm dark:shadow-none">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-ink">{item.title}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{formatDate(item.createdAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge tone={item.readAt ? "default" : config.tone}>{item.readAt ? "Leida" : config.label}</Badge>
              <ChevronRight size={14} className="text-muted" />
            </div>
          </div>
          <p className="mt-2 text-sm leading-5 text-muted">{item.body}</p>
        </div>
      </div>
    </Card>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
