"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import { ImagePlus, Megaphone, Send, Trash2, X } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import type { Announcement, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, NotificationCard, ProgressBar } from "@/components/ui";
import { AppButton, AppInput, AppTextarea } from "@/components/forms";

type Filter = "todos" | "no-leidos" | "importantes";

export default function ComunicadosPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<User | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");

  useEffect(() => {
    getSession().then(setSession);
    fetchAppData()
      .then((payload) => {
        setData(payload);
        setAnnouncements(payload.announcements);
      })
      .catch(() => setData(null));
  }, []);

  async function toggleRead(id: string) {
    if (!session) return;
    const current = announcements.find((item) => item.id === id);
    if (!current) return;
    const previous = announcements;
    const read = !current.readBy.includes(session.id);

    setAnnouncements((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, readBy: item.readBy.includes(session.id) ? item.readBy.filter((reader) => reader !== session.id) : [...item.readBy, session.id] }
          : item
      )
    );

    try {
      const response = await fetch(`/api/announcements/${id}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) });
      if (!response.ok) throw new Error("No se pudo actualizar la lectura.");
    } catch {
      setAnnouncements(previous);
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus("Solo se permiten imagenes JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus("La imagen debe pesar menos de 5 MB.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setStatus("");
  }

  function removeImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteAnnouncement(id: string) {
    if (!window.confirm("¿Eliminar este comunicado? Esta accion no se puede deshacer.")) return;
    const previous = announcements;
    setAnnouncements((prev) => prev.filter((item) => item.id !== id));
    try {
      const response = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
    } catch {
      setAnnouncements(previous);
      setStatus("No se pudo eliminar el comunicado.");
    }
  }

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) { setStatus("Inicia sesion para publicar."); return; }
    if (!title.trim() || !body.trim()) { setStatus("Escribe titulo y mensaje."); return; }

    setStatus("Publicando...");
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("body", body);
      if (imageFile) form.append("image", imageFile);

      const response = await fetch("/api/announcements", { method: "POST", body: form });
      if (!response.ok) throw new Error("No se pudo publicar.");
      const payload = await response.json() as { announcement: Announcement };

      setAnnouncements((current) => [payload.announcement, ...current]);
      setTitle("");
      setBody("");
      removeImage();
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
        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {[
            ["todos", "Todos"],
            ["no-leidos", "No leidos"],
            ["importantes", "Importantes"]
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as Filter)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black tracking-[-0.01em] transition active:scale-95 ${filter === value ? "bg-volt text-white shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" : "text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {!data ? <Card className="mb-3">Cargando comunicados desde PostgreSQL...</Card> : null}

        {session?.role !== "ASESOR" ? (
          <Card className="mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="text-volt" size={18} />
              <h2 className="text-lg font-black">Publicar comunicado</h2>
            </div>
            <form className="mt-3 grid gap-3" onSubmit={publishAnnouncement}>
              <AppInput
                label="Título"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <AppTextarea
                label="Mensaje para el equipo"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              {imagePreview ? (
                <div className="relative overflow-hidden rounded-2xl border border-line">
                  <NextImage src={imagePreview} alt="Vista previa" width={800} height={300} className="max-h-48 w-full object-cover" unoptimized />
                  <button type="button" onClick={removeImage} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-line bg-panel px-3 text-sm font-semibold text-muted transition hover:border-volt hover:text-volt"
                >
                  <ImagePlus size={16} />
                  Adjuntar imagen (opcional)
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageChange} />
              <AppButton type="submit" variant="primary" icon={<Send size={17} />} className="w-full">
                Mandar comunicado
              </AppButton>
              {status ? <p className="text-sm font-semibold text-muted">{status}</p> : null}
            </form>
          </Card>
        ) : null}

        <div className="space-y-2.5">
          {visibleAnnouncements.map((item) => {
            const unread = session ? !item.readBy.includes(session.id) : false;
            const authorUser = data?.users.find((user) => user.id === item.authorId);
            const author = authorUser?.name ?? "Equipo";
            const readProgress = advisors.length ? Math.round((item.readBy.length / advisors.length) * 100) : 0;
            return (
              <NotificationCard
                key={item.id}
                title={item.title}
                body={item.body}
                imageUrl={item.imageUrl}
                meta={`${item.date} por ${author}`}
                author={{ name: author, photoUrl: authorUser?.photoUrl }}
                unread={unread}
                action={
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Badge>{item.readBy.length}/{advisors.length}</Badge>
                      <span className="text-xs font-bold text-muted">lectura del equipo</span>
                    </div>
                    <ProgressBar value={readProgress} />
                    <div className="mt-2 grid gap-0 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                      {session?.role === "ASESOR" && session ? (
                        <button
                          onClick={() => void toggleRead(item.id)}
                          className="flex min-h-11 items-center justify-between py-2"
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
                          <div
                            key={advisor.id}
                            className="flex min-h-10 items-center justify-between py-2 text-sm"
                          >
                            <span className="font-semibold">{advisor.name}</span>
                            <Badge tone={read ? "done" : "warn"}>{read ? "leido" : "pendiente"}</Badge>
                          </div>
                        );
                      }) : null}
                    </div>
                    {session?.role !== "ASESOR" ? (
                      <button
                        onClick={() => void deleteAnnouncement(item.id)}
                        className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-200/60 bg-rose-50/60 text-sm font-black text-rose-600 transition active:scale-95"
                      >
                        <Trash2 size={15} />
                        Eliminar comunicado
                      </button>
                    ) : null}
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
