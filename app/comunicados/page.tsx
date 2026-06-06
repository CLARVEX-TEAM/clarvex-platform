"use client";

import { useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import type { Announcement, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, NotificationCard, ProgressBar } from "@/components/ui";

type Filter = "todos" | "no-leidos" | "importantes";

export default function ComunicadosPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [session, setSession] = useState<User | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");

  useEffect(() => {
    setSession(getSession());
    fetchAppData()
      .then((payload) => {
        setData(payload);
        setAnnouncements(payload.announcements);
      })
      .catch(() => setData(null));
  }, []);

  function toggleRead(id: string, userId: string) {
    if (!session) return;
    if (session.role === "ASESOR" && userId !== session.id) return;

    const current = announcements.find((item) => item.id === id);
    const read = !current?.readBy.includes(userId);

    setAnnouncements((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, readBy: item.readBy.includes(userId) ? item.readBy.filter((reader) => reader !== userId) : [...item.readBy, userId] }
          : item
      )
    );

    fetch(`/api/announcements/${id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorId: session.id, userId, read })
    }).catch(() => undefined);
  }

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();

    if (!session) {
      setStatus("Inicia sesion para publicar.");
      return;
    }

    if (!title.trim() || !body.trim()) {
      setStatus("Escribe titulo y mensaje.");
      return;
    }

    setStatus("Publicando...");

    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, authorId: session.id })
      });

      if (!response.ok) throw new Error("No se pudo publicar.");
      const payload = await response.json() as { announcement: Announcement };

      setAnnouncements((current) => [payload.announcement, ...current]);
      setTitle("");
      setBody("");
      setStatus("Comunicado publicado.");
    } catch {
      setStatus("No se pudo publicar el comunicado.");
    }
  }

  const advisors = data?.users.filter((user) => user.role === "ASESOR") ?? [];
  const visibleAnnouncements = announcements.filter((item) => {
    const unread = session ? !item.readBy.includes(session.id) : false;
    const important = /urgente|importante|critico|critica/i.test(`${item.title} ${item.body}`);
    if (filter === "no-leidos") return unread;
    if (filter === "importantes") return important;
    return true;
  });

  return (
    <>
      <AppHeader title="Comunicados" subtitle={session?.role === "ASESOR" ? "Lee avisos y confirma tu lectura." : "Publicacion, lectura y seguimiento por asesor."} backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2">
          {[
            ["todos", "Todos"],
            ["no-leidos", "No leidos"],
            ["importantes", "Importantes"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as Filter)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black transition ${filter === value ? "bg-volt text-void" : "liquid-glass text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!data ? <Card className="mb-5">Cargando comunicados desde PostgreSQL...</Card> : null}

        {session?.role !== "ASESOR" ? (
          <Card className="mb-5">
            <div className="flex items-center gap-2">
              <Megaphone className="text-volt" size={18} />
              <h2 className="text-lg font-black">Publicar comunicado</h2>
            </div>
            <form className="mt-4 grid gap-3" onSubmit={publishAnnouncement}>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 outline-none focus:border-volt"
                placeholder="Titulo"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-24 rounded-2xl border border-line bg-panel px-3 py-3 outline-none focus:border-volt"
                placeholder="Mensaje para el equipo"
              />
              <Button type="submit" className="w-full" variant="primary" icon={<Send size={17} />}>
                Mandar comunicado
              </Button>
              {status ? <p className="text-sm font-semibold text-muted">{status}</p> : null}
            </form>
          </Card>
        ) : null}

        <div className="space-y-4">
          {visibleAnnouncements.map((item) => {
            const unread = session ? !item.readBy.includes(session.id) : false;
            const author = data?.users.find((user) => user.id === item.authorId)?.name ?? "Equipo";
            const readProgress = advisors.length ? Math.round((item.readBy.length / advisors.length) * 100) : 0;
            return (
              <NotificationCard
                key={item.id}
                title={item.title}
                body={item.body}
                meta={`${item.date} por ${author}`}
                unread={unread}
                action={
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Badge>{item.readBy.length}/{advisors.length}</Badge>
                      <span className="text-xs font-bold text-muted">lectura del equipo</span>
                    </div>
                    <ProgressBar value={readProgress} />
                    <div className="mt-4 grid gap-2">
                      {session?.role === "ASESOR" && session ? (
                        <button
                          onClick={() => toggleRead(item.id, session.id)}
                          className="liquid-glass flex items-center justify-between rounded-2xl p-3"
                        >
                          <span className="font-semibold">Mi lectura</span>
                          <Badge tone={item.readBy.includes(session.id) ? "done" : "warn"}>
                            {item.readBy.includes(session.id) ? "leido" : "marcar como leido"}
                          </Badge>
                        </button>
                      ) : null}

                      {session?.role !== "ASESOR" ? advisors.map((advisor) => {
                        const read = item.readBy.includes(advisor.id);
                        return (
                          <button
                            key={advisor.id}
                            onClick={() => toggleRead(item.id, advisor.id)}
                            className="liquid-glass flex items-center justify-between rounded-2xl p-3"
                          >
                            <span className="font-semibold">{advisor.name}</span>
                            <Badge tone={read ? "done" : "warn"}>{read ? "leido" : "pendiente"}</Badge>
                          </button>
                        );
                      }) : null}
                    </div>
                  </>
                }
              />
            );
          })}
          {visibleAnnouncements.length === 0 ? (
            <Card>
              <p className="font-black">Sin comunicados</p>
              <p className="mt-2 text-sm text-muted">Los avisos de gerencia apareceran aqui con estado de lectura.</p>
            </Card>
          ) : null}
        </div>
      </AppFrame>
      <BottomNav />
    </>
  );
}
