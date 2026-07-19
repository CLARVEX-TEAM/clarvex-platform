"use client";

import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, Lock, Plus, Star, Trash2, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, ProgressBar } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";

type Question = { id: string; text: string; type: "RATING" | "TEXT"; order: number };
type Survey = { id: string; title: string; description: string | null; anonymous: boolean; active: boolean; createdAt: string; questions: Question[]; responded: boolean; responseCount: number };
type DraftQuestion = { text: string; type: "RATING" | "TEXT" };
type ResultQuestion =
  | { id: string; text: string; type: "RATING"; average: number | null; count: number; distribution: number[] }
  | { id: string; text: string; type: "TEXT"; texts: { text: string; name: string | null }[] };
type Results = { id: string; title: string; anonymous: boolean; responseCount: number; totalRecipients: number; questions: ResultQuestion[] };

export default function EscritorioEncuestas() {
  const toast = useToast();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ text: "", type: "RATING" }]);
  const [submitting, setSubmitting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const data = await fetch("/api/surveys", { cache: "no-store" }).then((r) => r.json() as Promise<{ surveys?: Survey[]; totalRecipients?: number }>);
      setSurveys(data.surveys ?? []);
      setTotalRecipients(data.totalRecipients ?? 0);
    } catch {
      toast("No se pudieron cargar las encuestas.", "error");
    } finally {
      setLoading(false);
    }
  }

  function setQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  async function create() {
    const cleanQuestions = questions.map((q) => ({ ...q, text: q.text.trim() })).filter((q) => q.text.length >= 2);
    if (title.trim().length < 2) { toast("Escribe un título.", "error"); return; }
    if (cleanQuestions.length === 0) { toast("Agrega al menos una pregunta.", "error"); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, anonymous, questions: cleanQuestions })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo crear.");
      toast("Encuesta publicada y notificada al equipo.", "success");
      setTitle(""); setDescription(""); setAnonymous(true); setQuestions([{ text: "", type: "RATING" }]);
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo crear.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleResults(id: string) {
    if (openId === id) { setOpenId(null); setResults(null); return; }
    setOpenId(id);
    setResults(null);
    setResultsLoading(true);
    try {
      const data = await fetch(`/api/surveys/${id}`, { cache: "no-store" }).then((r) => r.json() as Promise<Results>);
      setResults(data);
    } catch {
      toast("No se pudieron cargar los resultados.", "error");
    } finally {
      setResultsLoading(false);
    }
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    if (!id) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      if (openId === id) { setOpenId(null); setResults(null); }
      setSurveys((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast("No se pudo eliminar.", "error");
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  const inputClass = "min-h-11 w-full rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-none focus:border-volt";

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Crear encuesta */}
      <Card className="col-span-2 h-fit p-5">
        <div className="mb-3 flex items-center gap-2"><ClipboardCheck className="text-volt" size={18} /><h2 className="text-lg font-semibold text-ink">Nueva encuesta</h2></div>
        <div className="grid gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Título (ej. Clima laboral junio)" className={inputClass} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} placeholder="Descripción (opcional)…" className="rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-volt" />
          <label className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold text-ink"><Lock size={15} className="text-emerald-600" /> Respuestas anónimas</span>
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-5 accent-volt" />
          </label>

          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Preguntas</p>
            {questions.map((q, index) => (
              <div key={index} className="rounded-2xl border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <input value={q.text} onChange={(e) => setQuestion(index, { text: e.target.value })} maxLength={200} placeholder={`Pregunta ${index + 1}`} className="min-h-10 flex-1 rounded-xl border border-line bg-panel px-2.5 text-sm font-bold text-ink outline-none focus:border-volt" />
                  {questions.length > 1 ? (
                    <button type="button" onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))} aria-label="Quitar pregunta" className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:text-rose-500"><X size={16} /></button>
                  ) : null}
                </div>
                <div className="mt-2 flex gap-1.5">
                  {(["RATING", "TEXT"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setQuestion(index, { type: t })} className={`min-h-8 rounded-full px-3 text-xs font-semibold transition ${q.type === t ? "bg-volt text-white" : "bg-panel text-muted ring-1 ring-line"}`}>
                      {t === "RATING" ? "★ Calificación 1-5" : "✎ Texto libre"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {questions.length < 15 ? (
              <button type="button" onClick={() => setQuestions((prev) => [...prev, { text: "", type: "RATING" }])} className="flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm font-bold text-muted transition hover:border-volt hover:text-volt">
                <Plus size={16} /> Agregar pregunta
              </button>
            ) : null}
          </div>

          <Button type="button" variant="primary" onClick={() => void create()} disabled={submitting} className="w-full">
            {submitting ? "Publicando…" : "Publicar encuesta"}
          </Button>
          <p className="text-center text-[11px] text-muted">Se notificará al equipo (push + interna).</p>
        </div>
      </Card>

      {/* Lista + resultados */}
      <div className="col-span-3 space-y-3">
        {loading ? (
          <Card className="text-sm font-semibold text-muted">Cargando…</Card>
        ) : surveys.length === 0 ? (
          <Card className="p-5"><EmptyState icon={ClipboardCheck} title="Sin encuestas" description="Crea la primera desde el panel de la izquierda." /></Card>
        ) : surveys.map((survey) => {
          const pct = totalRecipients > 0 ? Math.round((survey.responseCount / totalRecipients) * 100) : 0;
          const open = openId === survey.id;
          return (
            <Card key={survey.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-ink">{survey.title}</h3>
                    {survey.anonymous ? <Badge tone="success"><Lock size={11} /> Anónima</Badge> : null}
                  </div>
                  {survey.description ? <p className="mt-0.5 text-sm text-muted">{survey.description}</p> : null}
                  <p className="mt-1 text-xs text-muted">{survey.questions.length} pregunta{survey.questions.length === 1 ? "" : "s"} · {survey.responseCount}/{totalRecipients} respondieron ({pct}%)</p>
                </div>
                <button onClick={() => setPendingDeleteId(survey.id)} aria-label="Eliminar encuesta" className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30"><Trash2 size={16} /></button>
              </div>
              <div className="mt-2"><ProgressBar value={pct} /></div>
              <Button type="button" variant="ghost" onClick={() => void toggleResults(survey.id)} className="mt-3 min-h-9 px-3 text-xs">
                <BarChart3 size={14} /> {open ? "Ocultar resultados" : "Ver resultados"}
              </Button>

              {open ? (
                <div className="mt-3 border-t border-line pt-3">
                  {resultsLoading || !results ? (
                    <p className="text-sm text-muted">Cargando resultados…</p>
                  ) : results.responseCount === 0 ? (
                    <p className="text-sm text-muted">Aún no hay respuestas.</p>
                  ) : (
                    <div className="space-y-4">
                      {results.questions.map((q) => (
                        <div key={q.id}>
                          <p className="mb-1.5 text-sm font-bold text-ink">{q.text}</p>
                          {q.type === "RATING" ? (
                            <div>
                              <div className="mb-1.5 flex items-center gap-2">
                                <Star size={16} className="fill-amber-400 text-amber-400" />
                                <span className="text-lg font-semibold text-ink">{q.average !== null ? q.average.toFixed(1) : "—"}</span>
                                <span className="text-xs text-muted">promedio · {q.count} respuesta{q.count === 1 ? "" : "s"}</span>
                              </div>
                              <div className="space-y-1">
                                {[5, 4, 3, 2, 1].map((star) => {
                                  const n = q.distribution[star - 1] ?? 0;
                                  const w = q.count > 0 ? Math.round((n / q.count) * 100) : 0;
                                  return (
                                    <div key={star} className="flex items-center gap-2 text-[11px]">
                                      <span className="w-6 shrink-0 font-bold text-muted">{star}★</span>
                                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-amber-400" style={{ width: `${w}%` }} /></div>
                                      <span className="w-6 shrink-0 text-right font-bold text-muted">{n}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {q.texts.length === 0 ? <p className="text-xs text-muted">Sin respuestas de texto.</p> : q.texts.map((t, i) => (
                                <div key={i} className="rounded-xl bg-panel px-3 py-2 text-sm text-ink">
                                  “{t.text}”{t.name ? <span className="ml-1 text-xs text-muted">— {t.name}</span> : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar encuesta?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
