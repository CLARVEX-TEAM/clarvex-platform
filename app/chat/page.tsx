"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, BottomNav, Card, ProfileAvatar } from "@/components/ui";
import { chatPreview } from "@/components/ChatPicker";
import { useToast } from "@/components/Toast";

type RoomSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  other: { id: string; name: string; photoUrl: string | null; role: string; online: boolean; lastSeenAt: string | null } | null;
  lastMessage: { body: string; deleted: boolean; senderName: string; createdAt: string } | null;
  unreadCount: number;
};

type Teammate = { id: string; name: string; photoUrl: string | null };

export default function ChatPage() {
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<User | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [team, setTeam] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((s) => { if (!s) router.replace("/login"); else setSession(s); });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // Refrescar presencia / no leídos cada 5 s mientras la lista está abierta.
    const interval = setInterval(() => { void refreshRooms(); }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshRooms() {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" }).then((r) => r.json() as Promise<{ rooms: RoomSummary[] }>);
      setRooms(res.rooms ?? []);
    } catch {
      // Sondeo cada 5 s en un móvil: perder una petición por señal intermitente
      // o por tener la app en segundo plano es lo NORMAL. Se reintenta al
      // siguiente ciclo.
      //
      // Antes se propagaba sin capturar: Sentry lo reportaba como
      // "TypeError: Failed to fetch" (unhandled) cada 5 segundos.
    }
  }

  async function load() {
    try {
      const [, appData] = await Promise.all([refreshRooms(), fetchAppData()]);
      setTeam(appData.users.filter((u) => u.id !== session?.id).map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl ?? null })));
    } catch {
      // Sin conexión al abrir: se muestra la pantalla vacía y el sondeo la
      // llenará en cuanto vuelva la red.
    } finally {
      setLoading(false);
    }
  }

  async function openDirect(targetId: string) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId })
      }).then((r) => r.json() as Promise<{ room: { id: string } }>);
      router.push(`/chat/${res.room.id}`);
    } catch {
      toast("No se pudo abrir el chat. Revisa tu conexión.", "error");
    }
  }

  const homeHref = session?.role === "ASESOR" ? "/advisor" : "/manager";

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
    if (diffDays === 1) return "Ayer";
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }

  return (
    <>
      <AppHeader title="Chat" subtitle="Mensajes del equipo" backHref={homeHref} />
      <AppFrame>
        {loading ? (
          <p className="py-6 text-center text-sm font-semibold text-muted">Cargando chats…</p>
        ) : (
          <>
            {/* Rooms activos */}
            {rooms.length > 0 && (
              <Card className="mb-3 overflow-hidden p-0">
                {rooms.map((room, i) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => router.push(`/chat/${room.id}`)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-volt/8 ${i < rooms.length - 1 ? "border-b border-line/50" : ""}`}
                  >
                    <div className="relative shrink-0">
                      {room.type === "GROUP" ? (
                        <span className="grid size-11 place-items-center rounded-2xl bg-volt/15 text-volt">
                          <Users size={20} />
                        </span>
                      ) : (
                        <ProfileAvatar name={room.other?.name ?? "?"} photoUrl={room.other?.photoUrl} size="md" />
                      )}
                      {room.type === "DIRECT" && room.other?.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white bg-green-500 dark:border-[#0f1729]" />
                      )}
                      {room.unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-volt text-[10px] font-semibold text-white">
                          {room.unreadCount > 9 ? "9+" : room.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-bold ${room.unreadCount > 0 ? "text-ink" : "text-ink/80"}`}>
                          {room.type === "GROUP" ? (room.name ?? "Todos") : room.other?.name}
                        </p>
                        {room.lastMessage && (
                          <span className="shrink-0 text-[11px] text-muted">{formatTime(room.lastMessage.createdAt)}</span>
                        )}
                      </div>
                      {room.lastMessage ? (
                        <p className={`truncate text-xs ${room.unreadCount > 0 ? "font-semibold text-ink/70" : "text-muted"}`}>
                          {room.type === "GROUP" ? `${room.lastMessage.senderName}: ` : ""}{chatPreview(room.lastMessage.body, room.lastMessage.deleted)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted">Sin mensajes</p>
                      )}
                    </div>
                  </button>
                ))}
              </Card>
            )}

            {/* Iniciar chat directo */}
            {team.length > 0 && (
              <Card className="p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="text-volt" size={17} />
                  <h2 className="text-base font-semibold">Nuevo mensaje directo</h2>
                </div>
                <div className="grid gap-1">
                  {team.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => void openDirect(member.id)}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors active:bg-volt/8"
                    >
                      <ProfileAvatar name={member.name} photoUrl={member.photoUrl} size="sm" />
                      <span className="text-sm font-bold text-ink">{member.name}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}
