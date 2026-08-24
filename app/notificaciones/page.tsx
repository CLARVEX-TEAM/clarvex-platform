"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Cake, CalendarClock, Check, CheckCheck, ClipboardCheck, GraduationCap, HeartHandshake, ImagePlus, Megaphone, MessageCircle, PackageSearch, Sparkles, Target, Trash2, Trophy, X } from "lucide-react";
import { useSession } from "@/lib/use-session";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, Button, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { AnimatedList } from "@/components/magic/AnimatedList";

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
  const { session } = useSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const toast = useToast();
  const homeHref = session?.role === "ASESOR" ? "/advisor" : "/manager";

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
    // Marcar la primera fila optimista: quien toca una notificación se va a
    // otra pantalla en el mismo gesto, así que si se espera a la respuesta el
    // cambio nunca llega a verse.
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      // `keepalive` es la clave: el clic navega de inmediato, y sin esto el
      // navegador aborta la petición al desmontar el documento. Ese aborto es
      // el `TypeError: Load failed` que llegaba a Sentry, y de paso la
      // notificación se quedaba sin marcar. Con keepalive el envío sobrevive a
      // la navegación.
      await fetch(`/api/notifications/${id}/read`, { method: "POST", keepalive: true });
      window.dispatchEvent(new Event("notifications-updated"));
    } catch {
      // Sin red: se queda marcada en pantalla y el servidor se entera al
      // siguiente refresco. No se avisa porque para entonces ya se navegó a
      // otra pantalla y el aviso saldría fuera de contexto.
    }
  }

  async function markAllRead() {
    const previous = items;
    const previousUnread = unreadCount;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch {
      // Aquí sí se avisa: no hay navegación, la persona sigue mirando la lista
      // y vería las notificaciones volver a "sin leer" sin explicación.
      setItems(previous);
      setUnreadCount(previousUnread);
      toast("No se pudieron marcar como leídas. Revisa tu conexión.", "error");
    }
  }

  async function deleteOne(id: string) {
    const previous = items;
    const wasUnread = items.find((item) => item.id === id && !item.readAt);
    setItems((current) => current.filter((item) => item.id !== id));
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch {
      setItems(previous);
    }
  }

  async function clearAll() {
    setClearing(true);
    const previous = items;
    setItems([]);
    setUnreadCount(0);
    try {
      const response = await fetch("/api/notifications", { method: "DELETE" });
      if (!response.ok) throw new Error();
      window.dispatchEvent(new Event("notifications-updated"));
    } catch {
      setItems(previous);
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  return (
    <>
      <AppHeader
        title="Notificaciones"
        subtitle={unreadCount ? `${unreadCount} pendientes por revisar.` : "Todo esta al dia."}
        backHref={homeHref}
        action={
          unreadCount || items.length ? (
            <div className="flex items-center gap-1.5">
              {unreadCount ? <Button type="button" variant="ghost" onClick={markAllRead} className="min-h-11 px-3" aria-label="Marcar todas como leidas"><CheckCheck size={17} /></Button> : null}
              {items.length ? <Button type="button" variant="ghost" onClick={() => setConfirmClear(true)} className="min-h-11 px-3 text-rose-500" aria-label="Borrar todas las notificaciones"><Trash2 size={17} /></Button> : null}
            </div>
          ) : null
        }
      />
      <AppFrame>
        {error ? <Card className="mb-3 text-sm font-semibold text-rose-700">{error}</Card> : null}
        {loading ? <Card className="text-sm font-semibold text-muted">Cargando notificaciones...</Card> : items.length === 0 ? <Card className="py-8 text-center"><Target className="mx-auto text-volt" size={28} /><h2 className="mt-3 font-semibold text-ink">Sin notificaciones</h2><p className="mt-1 text-sm text-muted">Los planes, comunicados y pendientes apareceran aqui.</p></Card> : <AnimatedList className="space-y-2.5">{items.map((item) => <NotificationRow key={item.id} item={item} onRead={markRead} onDelete={deleteOne} />)}</AnimatedList>}
      </AppFrame>
      <ConfirmDialog
        open={confirmClear}
        title="¿Borrar todas las notificaciones?"
        confirmLabel="Borrar todas"
        loading={clearing}
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}

function NotificationRow({ item, onRead, onDelete }: { item: NotificationItem; onRead: (id: string) => void; onDelete: (id: string) => void }) {
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
              <h2 className="text-sm font-semibold text-ink">{item.title}</h2>
              <p className="mt-0.5 text-[11px] text-muted">{formatDate(item.createdAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge tone={item.readAt ? "default" : config.tone}>{item.readAt ? "Leida" : config.label}</Badge>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); onDelete(item.id); }}
                aria-label="Borrar notificación"
                className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"
              >
                <X size={15} />
              </button>
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
