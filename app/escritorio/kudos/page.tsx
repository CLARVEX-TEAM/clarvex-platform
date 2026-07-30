"use client";

import { useEffect, useState } from "react";
import { HeartHandshake, Send, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import { fetchAppData } from "@/lib/app-data";
import { KUDO_OPTIONS } from "@/lib/kudos";
import type { User } from "@/lib/types";
import { ProfileAvatar } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  DeskEmpty, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";
import { BorderBeam } from "@/components/magic/BorderBeam";
import { AnimatedList } from "@/components/magic/AnimatedList";

type KudoItem = { id: string; emoji: string; message: string | null; from: { name: string; photoUrl?: string | null }; to: { name: string; photoUrl?: string | null }; createdAt: string };
type TopWeek = { name: string; photoUrl: string | null; count: number } | null;
type Teammate = { id: string; name: string; photoUrl?: string | null };

export default function EscritorioKudos() {
  const toast = useToast();
  const [session, setSession] = useState<User | null>(null);
  const [team, setTeam] = useState<Teammate[]>([]);
  const [kudos, setKudos] = useState<KudoItem[]>([]);
  const [topWeek, setTopWeek] = useState<TopWeek>(null);
  const [toUserId, setToUserId] = useState("");
  const [emoji, setEmoji] = useState(KUDO_OPTIONS[0].emoji);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((current) => { if (current) setSession(current); });
  }, []);

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
      toast("No se pudo cargar el reconocimiento.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!toUserId) { toast("Elige a quién reconocer.", "error"); return; }
    setSending(true);
    try {
      const response = await fetch("/api/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId, emoji, message: message.trim() || undefined })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar.");
      toast("Reconocimiento enviado.", "success");
      setMessage("");
      setToUserId("");
      await refreshFeed();
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo enviar.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <DeskReveal index={0}>
        <div className="space-y-8 xl:sticky xl:top-20">
          {topWeek ? (
            <DeskSection title="Reconocido de la semana">
              {/* BorderBeam y no ShineBorder: esto es IMPORTANTE, no algo sin
                  atender. El haz jerarquiza; el otro reclamaría acción. */}
              <BorderBeam radius="rounded-[18px]" ringPx={1.5}>
                <div className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn">
                      <Trophy size={22} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ProfileAvatar name={topWeek.name} photoUrl={topWeek.photoUrl} size="sm" className="size-6 shrink-0 rounded-md text-[9px] shadow-none" />
                        <p className="truncate text-ui font-semibold text-ink">{topWeek.name}</p>
                      </div>
                      <p className="mt-0.5 text-caption text-muted">
                        {topWeek.count} {topWeek.count === 1 ? "reconocimiento" : "reconocimientos"} esta semana
                      </p>
                    </div>
                  </div>
                </div>
              </BorderBeam>
            </DeskSection>
          ) : null}

          <DeskSection title="Reconocer a alguien">
            <DeskPanel>
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">¿A quién?</span>
                  <select value={toUserId} onChange={(event) => setToUserId(event.target.value)} className={deskInput}>
                    <option value="">Elige un integrante…</option>
                    {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                </label>

                <fieldset className="grid gap-1.5">
                  <legend className="text-caption font-medium text-muted">Motivo</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {KUDO_OPTIONS.map((option) => (
                      <button
                        key={option.emoji}
                        type="button"
                        onClick={() => setEmoji(option.emoji)}
                        aria-pressed={emoji === option.emoji}
                        className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-caption font-medium transition-colors ${
                          emoji === option.emoji
                            ? "border-accent/45 bg-accent-quiet text-ink"
                            : "border-line bg-panel text-muted hover:text-ink"
                        }`}
                      >
                        <span aria-hidden>{option.emoji}</span>{option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Mensaje (opcional)</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={280}
                    rows={3}
                    placeholder="Qué hizo y por qué importó…"
                    className={`${deskInput} py-2.5`}
                  />
                </label>

                <DeskPrimaryButton type="button" onClick={() => void send()} disabled={sending} className="w-full">
                  <Send size={15} /> {sending ? "Enviando…" : "Enviar reconocimiento"}
                </DeskPrimaryButton>
              </div>
            </DeskPanel>
          </DeskSection>
        </div>
      </DeskReveal>

      <DeskReveal index={1}>
        <DeskSection title={`Reconocimientos recientes · ${kudos.length}`}>
          {loading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <DeskSkeleton key={i} className="h-16" />)}</div>
          ) : kudos.length === 0 ? (
            <DeskEmpty
              icon={HeartHandshake}
              title="Todavía no hay reconocimientos"
              hint="Sé el primero. Al reconocido le llega una notificación y aparece en el resumen semanal."
            />
          ) : (
            <AnimatedList className="max-w-3xl">
              {kudos.map((kudo) => (
                <div key={kudo.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                  <span className="mt-0.5 text-xl" aria-hidden>{kudo.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-ui text-ink">
                      <span className="font-medium text-accent">{kudo.from.name}</span> reconoció a {kudo.to.name}
                    </p>
                    {kudo.message ? <p className="mt-0.5 max-w-[70ch] text-ui text-muted">{kudo.message}</p> : null}
                    <p className="mt-0.5 text-caption text-muted">
                      {new Date(kudo.createdAt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </AnimatedList>
          )}
        </DeskSection>
      </DeskReveal>
    </div>
  );
}
