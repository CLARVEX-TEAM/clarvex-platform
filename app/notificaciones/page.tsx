"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCheck, ClipboardCheck, ImagePlus, Megaphone, MessageCircle, Target, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card } from "@/components/ui";

type NotificationType = "PLAN_READY" | "NEW_ANNOUNCEMENT" | "PENDING_ASSIGNED" | "TASK_COMPLETED" | "KPI_GOAL_REACHED" | "COMMENT_ADDED" | "EVIDENCE_ADDED";
type NotificationItem = { id: string; type: NotificationType; title: string; body: string; readAt: string | null; createdAt: string };

const typeConfig = {
  PLAN_READY: { label: "Plan", icon: ClipboardCheck, tone: "default" as const },
  NEW_ANNOUNCEMENT: { label: "Comunicado", icon: Megaphone, tone: "warn" as const },
  PENDING_ASSIGNED: { label: "Pendiente", icon: Bell, tone: "danger" as const },
  TASK_COMPLETED: { label: "Tarea", icon: Check, tone: "success" as const },
  KPI_GOAL_REACHED: { label: "Meta KPI", icon: Trophy, tone: "success" as const },
  COMMENT_ADDED: { label: "Comentario", icon: MessageCircle, tone: "default" as const },
  EVIDENCE_ADDED: { label: "Evidencia", icon: ImagePlus, tone: "success" as const }
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
  const config = typeConfig[item.type];
  const Icon = config.icon;
  return <Card className={item.readAt ? "p-3.5" : "bg-blue-50/70 p-3.5 ring-1 ring-volt/15"}><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-volt shadow-sm"><Icon size={18} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-black text-ink">{item.title}</h2><p className="mt-0.5 text-[11px] text-muted">{formatDate(item.createdAt)}</p></div><Badge tone={item.readAt ? "default" : config.tone}>{item.readAt ? "Leida" : config.label}</Badge></div><p className="mt-2 text-sm leading-5 text-muted">{item.body}</p>{!item.readAt ? <button type="button" onClick={() => onRead(item.id)} className="mt-2.5 text-xs font-black text-volt">Marcar como leida</button> : null}</div></div></Card>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
