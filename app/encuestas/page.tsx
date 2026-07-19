"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Lock, Star } from "lucide-react";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, EmptyState } from "@/components/ui";
import { useToast } from "@/components/Toast";

type Question = { id: string; text: string; type: "RATING" | "TEXT"; order: number };
type Survey = { id: string; title: string; description: string | null; anonymous: boolean; active: boolean; createdAt: string; questions: Question[]; responded: boolean; responseCount: number };

export default function EncuestasPage() {
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<User | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, Record<string, { rating?: number; text?: string }>>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((current) => { if (!current) router.replace("/login"); else setSession(current); });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    try {
      const data = await fetch("/api/surveys", { cache: "no-store" }).then((r) => r.json() as Promise<{ surveys?: Survey[] }>);
      setSurveys(data.surveys ?? []);
    } catch {
      toast("No se pudieron cargar las encuestas.", "error");
    } finally {
      setLoading(false);
    }
  }

  function setRating(surveyId: string, questionId: string, rating: number) {
    setAnswers((prev) => ({ ...prev, [surveyId]: { ...prev[surveyId], [questionId]: { ...prev[surveyId]?.[questionId], rating } } }));
  }
  function setText(surveyId: string, questionId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [surveyId]: { ...prev[surveyId], [questionId]: { ...prev[surveyId]?.[questionId], text } } }));
  }

  async function submit(survey: Survey) {
    const surveyAnswers = answers[survey.id] ?? {};
    const missing = survey.questions.some((q) => {
      const a = surveyAnswers[q.id];
      return q.type === "RATING" ? !a?.rating : false; // texto es opcional
    });
    if (missing) { toast("Responde todas las calificaciones.", "error"); return; }
    setSendingId(survey.id);
    try {
      const payload = survey.questions.map((q) => ({ questionId: q.id, rating: surveyAnswers[q.id]?.rating, text: surveyAnswers[q.id]?.text }));
      const response = await fetch(`/api/surveys/${survey.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo enviar.");
      toast("¡Gracias por tu respuesta! 🙌", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo enviar.", "error");
    } finally {
      setSendingId(null);
    }
  }

  const pending = surveys.filter((s) => s.active && !s.responded);
  const done = surveys.filter((s) => s.responded || !s.active);

  return (
    <>
      <AppHeader title="Encuestas" subtitle="Tu opinión cuenta" backHref={session?.role === "ASESOR" ? "/advisor" : "/manager"} />
      <AppFrame>
        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando encuestas…</Card>
        ) : surveys.length === 0 ? (
          <Card><EmptyState icon={ClipboardCheck} title="Sin encuestas" description="Cuando gerencia publique una encuesta, aparecerá aquí." /></Card>
        ) : (
          <div className="space-y-3">
            {pending.map((survey) => (
              <Card key={survey.id} className="p-3.5">
                <div className="mb-1 flex items-center gap-2">
                  <ClipboardCheck className="text-volt" size={18} />
                  <h2 className="text-lg font-semibold">{survey.title}</h2>
                </div>
                {survey.description ? <p className="mb-2 text-sm text-muted">{survey.description}</p> : null}
                {survey.anonymous ? <p className="mb-3 flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Lock size={12} /> Respuesta anónima</p> : null}
                <div className="space-y-4">
                  {survey.questions.map((q) => (
                    <div key={q.id}>
                      <p className="mb-2 text-sm font-bold text-ink">{q.text}</p>
                      {q.type === "RATING" ? (
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const active = (answers[survey.id]?.[q.id]?.rating ?? 0) >= star;
                            return (
                              <button key={star} type="button" onClick={() => setRating(survey.id, q.id, star)} aria-label={`${star} estrellas`} className="transition active:scale-90">
                                <Star size={30} className={active ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"} />
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <textarea value={answers[survey.id]?.[q.id]?.text ?? ""} onChange={(e) => setText(survey.id, q.id, e.target.value)} maxLength={500} rows={2} placeholder="Escribe tu respuesta (opcional)…" className="w-full rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt" />
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="primary" onClick={() => void submit(survey)} disabled={sendingId === survey.id} className="mt-4 w-full">
                  {sendingId === survey.id ? "Enviando…" : "Enviar respuesta"}
                </Button>
              </Card>
            ))}

            {done.length > 0 ? (
              <div className="pt-1">
                <p className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.1em] text-muted">Anteriores</p>
                <div className="space-y-2.5">
                  {done.map((survey) => (
                    <Card key={survey.id} className="flex items-center justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{survey.title}</p>
                        <p className="text-xs text-muted">{survey.questions.length} pregunta{survey.questions.length === 1 ? "" : "s"}</p>
                      </div>
                      <Badge tone={survey.responded ? "success" : "default"}>{survey.responded ? "Respondida" : "Cerrada"}</Badge>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </AppFrame>
      <BottomNav />
    </>
  );
}
