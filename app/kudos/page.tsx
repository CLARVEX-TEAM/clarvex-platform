"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake, Send, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import { KUDO_OPTIONS } from "@/lib/kudos";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, ProfileAvatar } from "@/components/ui";

type KudoItem = { id: string; emoji: string; message: string | null; from: { name: string; photoUrl?: string | null }; to: { name: string; photoUrl?: string | null }; createdAt: string };
type TopWeek = { name: string; photoUrl: string | null; count: number } | null;
type Teammate = { id: string; name: string; photoUrl?: string | null };

export default function KudosPage() {
  const router = useRouter();
  const [session, setSession] = useState<User | null>(null);
  const [team, setTeam] = useState<Teammate[]>([]);
  const [kudos, setKudos] = useState<KudoItem[]>([]);
  const [topWeek, setTopWeek] = useState<TopWeek>(null);
  const [toUserId, setToUserId] = useState("");
  const [emoji, setEmoji] = useState(KUDO_OPTIONS[0].emoji);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((current) => { if (!current) router.replace("/login"); else setSession(current); });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void loadAll(session.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshFeed() {
    const payload = await fetch("/api/kudos", { cache: "no-store" }).then((response) => response.json() as Promise<{ kudos?: KudoItem[]; topWeek?: TopWeek }>);
    setKudos(payload.kudos ?? []);
    setTopWeek(payload.topWeek ?? null);
  }

  async function loadAll(currentUserId: string) {
    try {
      const data = await fetchAppData();
      setTeam(data.users.filter((u) => u.id !== currentUserId).map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl })));
      await refreshFeed();
    } catch {
      setStatus("No se pudo cargar el reconocimiento.");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!toUserId) { setStatus("Elige a quién reconocer."); return; }
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, emoji, message: message.trim() || undefined })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar.");
      setStatus("¡Reconocimiento enviado! 🎉");
      setMessage("");
      setToUserId("");
      await refreshFeed();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <AppHeader title="Reconocimiento" subtitle="Reconoce el buen trabajo de tu equipo" backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        {topWeek ? (
          <Card className="mb-3 border border-amber-300/40 bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 dark:from-[#2a2410] dark:to-[#2a1c10]">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-[#3a2e10]"><Trophy size={22} /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Reconocido de la semana</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <ProfileAvatar name={topWeek.name} photoUrl={topWeek.photoUrl} size="sm" />
                  <p className="truncate font-black text-ink">{topWeek.name}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted">{topWeek.count} {topWeek.count === 1 ? "reconocimiento" : "reconocimientos"} esta semana 🎉</p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="mb-3 p-3.5">
          <div className="mb-3 flex items-center gap-2">
            <HeartHandshake className="text-volt" size={18} />
            <h2 className="text-lg font-black">Reconocer a alguien</h2>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-muted">¿A quién?</span>
              <select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt">
                <option value="">Elige un integrante…</option>
                {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {KUDO_OPTIONS.map((option) => (
                <button
                  key={option.emoji}
                  type="button"
                  onClick={() => setEmoji(option.emoji)}
                  aria-pressed={emoji === option.emoji}
                  className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition active:scale-95 ${emoji === option.emoji ? "bg-volt/15 text-ink ring-1 ring-volt/40" : "bg-panel text-muted ring-1 ring-line"}`}
                >
                  <span>{option.emoji}</span><span className="text-xs">{option.label}</span>
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Mensaje (opcional)…"
              className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt"
            />
            <Button type="button" variant="primary" icon={<Send size={16} />} onClick={() => void send()} disabled={sending} className="w-full">
              {sending ? "Enviando…" : "Enviar reconocimiento"}
            </Button>
            {status ? <p className="text-sm font-semibold text-muted">{status}</p> : null}
          </div>
        </Card>

        <Card className="p-3.5">
          <h2 className="mb-2.5 text-lg font-black">Reconocimientos recientes</h2>
          {loading ? (
            <p className="py-4 text-sm font-semibold text-muted">Cargando…</p>
          ) : kudos.length === 0 ? (
            <p className="py-4 text-sm text-muted">Aún no hay reconocimientos. ¡Sé el primero! 👏</p>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {kudos.map((kudo) => (
                <div key={kudo.id} className="flex items-start gap-3 py-2.5">
                  <span className="mt-0.5 text-xl">{kudo.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink"><span className="text-volt">{kudo.from.name}</span> → {kudo.to.name}</p>
                    {kudo.message ? <p className="mt-0.5 text-sm text-muted">{kudo.message}</p> : null}
                    <p className="mt-0.5 text-[11px] text-muted">{new Date(kudo.createdAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}
