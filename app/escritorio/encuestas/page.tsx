"use client";

import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, Lock, Plus, Star, Trash2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import {
  AUDIENCE_LABEL, climateIndex, indexLevel, LEVEL_LABEL, ratingLevel, responseRate, worstQuestions,
  type ClimateLevel, type SurveyAudience
} from "@/lib/survey-climate";
import {
  DeskButton, DeskEmpty, DeskMeter, DeskPanel, DeskPrimaryButton, DeskReveal, DeskSection,
  DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";

type Question = { id: string; text: string; type: "RATING" | "TEXT"; order: number };
type Survey = { id: string; title: string; description: string | null; anonymous: boolean; audience?: SurveyAudience; active: boolean; createdAt: string; questions: Question[]; responded: boolean; responseCount: number };
type DraftQuestion = { text: string; type: "RATING" | "TEXT" };
type ResultQuestion =
  | { id: string; text: string; type: "RATING"; average: number | null; count: number; distribution: number[]; split?: boolean }
  | { id: string; text: string; type: "TEXT"; texts: { text: string; name: string | null }[] };
type Results = { id: string; title: string; anonymous: boolean; audience?: SurveyAudience; climateIndex?: number | null; responseCount: number; totalRecipients: number; questions: ResultQuestion[] };

export default function EscritorioEncuestas() {
  const toast = useToast();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [totalRecipients, setTotalRecipients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [audience, setAudience] = useState<SurveyAudience>("ALL");
  const [publishingId, setPublishingId] = useState<string | null>(null);
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

  /** Publica un borrador. Es el único momento en que se avisa al equipo. */
  async function publish(survey: Survey) {
    setPublishingId(survey.id);
    try {
      const response = await fetch(`/api/surveys/${survey.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; notified?: number };
      if (!response.ok) throw new Error(payload.error);
      toast(payload.notified ? `Publicada. Se avisó a ${payload.notified} persona${payload.notified === 1 ? "" : "s"}.` : "Publicada.", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : "No se pudo publicar.", "error");
    } finally {
      setPublishingId(null);
    }
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
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, anonymous, audience, publish: false, questions: cleanQuestions })
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

  return (
    <div className="grid gap-10 xl:grid-cols-[24rem_minmax(0,1fr)]">
      {/* Crear encuesta */}
      <DeskReveal index={0}>
        <div className="xl:sticky xl:top-20">
          <DeskSection title="Nueva encuesta" hint="Al publicarla, al equipo le llega push y notificación interna.">
            <DeskPanel>
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Título</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Clima laboral de junio" className={deskInput} />
                </label>

                <label className="grid gap-1">
                  <span className="text-caption font-medium text-muted">Descripción (opcional)</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} className={`${deskInput} py-2.5`} />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
                  <span className="flex items-center gap-2 text-ui text-ink">
                    <Lock size={14} className="text-ok" /> Respuestas anónimas
                  </span>
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-[rgb(var(--desk-accent))]" />
                </label>

                {/* A quien va dirigida. Una encuesta de clima para asesores no
                    deberia llegarle a gerencia ni contar en su tasa de respuesta. */}
                <fieldset className="grid gap-2">
                  <legend className="text-caption font-medium text-muted">¿Para quién es?</legend>
                  <div className="flex gap-1.5">
                    {(["ALL", "ADVISORS"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAudience(value)}
                        className={cn(
                          "min-h-9 flex-1 rounded-lg px-3 text-ui font-medium transition",
                          audience === value ? "bg-accent text-on-accent" : "bg-panel text-muted ring-1 ring-line hover:text-ink"
                        )}
                      >
                        <Users size={14} className="mr-1.5 inline" />
                        {AUDIENCE_LABEL[value]}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="grid gap-2">
                  <legend className="text-caption font-medium text-muted">Preguntas</legend>
                  {questions.map((q, index) => (
                    <div key={index} className="rounded-xl border border-line p-2.5">
                      <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`pregunta-${index}`}>Pregunta {index + 1}</label>
                        <input
                          id={`pregunta-${index}`}
                          value={q.text}
                          onChange={(e) => setQuestion(index, { text: e.target.value })}
                          maxLength={200}
                          placeholder={`Pregunta ${index + 1}`}
                          className={`${deskInput} min-h-9 flex-1`}
                        />
                        {questions.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                            aria-label={`Quitar pregunta ${index + 1}`}
                            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <X size={15} />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {(["RATING", "TEXT"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setQuestion(index, { type: t })}
                            aria-pressed={q.type === t}
                            className={`min-h-8 rounded-lg px-2.5 text-caption font-medium transition-colors ${
                              q.type === t ? "bg-accent text-on-accent" : "border border-line bg-panel text-muted hover:text-ink"
                            }`}
                          >
                            {t === "RATING" ? "Calificación 1–5" : "Texto libre"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {questions.length < 15 ? (
                    <button
                      type="button"
                      onClick={() => setQuestions((prev) => [...prev, { text: "", type: "RATING" }])}
                      className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-ui font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      <Plus size={15} /> Agregar pregunta
                    </button>
                  ) : null}
                </fieldset>

                {/* Se guarda como BORRADOR. Publicar es un segundo paso, en la
                    tarjeta: mandar un push a la tienda con una encuesta a medio
                    escribir no tiene vuelta atras. */}
                <DeskPrimaryButton type="button" onClick={() => void create()} disabled={submitting} className="w-full">
                  {submitting ? "Publicando…" : "Publicar encuesta"}
                </DeskPrimaryButton>
              </div>
            </DeskPanel>
          </DeskSection>
        </div>
      </DeskReveal>

      {/* Lista + resultados */}
      <DeskReveal index={1}>
        <DeskSection title={`Encuestas · ${surveys.length}`}>
          {loading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <DeskSkeleton key={i} className="h-32" />)}</div>
          ) : surveys.length === 0 ? (
            <DeskEmpty
              icon={ClipboardCheck}
              title="Sin encuestas todavía"
              hint="Crea la primera desde la izquierda. Puedes hacerla anónima para que el equipo responda con confianza."
            />
          ) : (
            <div className="space-y-3">
              {surveys.map((survey) => {
                const pct = totalRecipients > 0 ? Math.round((survey.responseCount / totalRecipients) * 100) : 0;
                const open = openId === survey.id;
                return (
                  <article key={survey.id} className="rounded-xl border border-line bg-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-ui font-semibold text-ink">{survey.title}</h3>
                          {!survey.active ? <Badge tone="warn">Borrador</Badge> : null}
                          {survey.anonymous ? <Badge tone="success"><Lock size={11} /> Anónima</Badge> : null}
                          {survey.audience === "ADVISORS" ? <Badge><Users size={11} /> Solo asesores</Badge> : null}
                        </div>
                        {survey.description ? <p className="mt-1 max-w-[70ch] text-ui text-muted">{survey.description}</p> : null}
                        <p className="mt-1 text-caption text-muted">
                          {survey.questions.length} pregunta{survey.questions.length === 1 ? "" : "s"} ·{" "}
                          {survey.responseCount}/{totalRecipients} respondieron
                        </p>
                      </div>
                      <button
                        onClick={() => setPendingDeleteId(survey.id)}
                        aria-label={`Eliminar ${survey.title}`}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {!survey.active ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <DeskPrimaryButton
                          type="button"
                          onClick={() => void publish(survey)}
                          disabled={publishingId === survey.id}
                        >
                          {publishingId === survey.id ? "Publicando…" : "Publicar y avisar"}
                        </DeskPrimaryButton>
                        <span className="text-caption text-muted">
                          Nadie la ve todavía. Al publicarla le llega un aviso a{" "}
                          {survey.audience === "ADVISORS" ? "los asesores" : "todo el equipo"}.
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-3">
                        <DeskMeter value={pct} className="flex-1" />
                        <span className="w-10 shrink-0 text-right text-caption font-medium text-ink">{pct}%</span>
                      </div>
                    )}

                    <DeskButton
                      type="button"
                      onClick={() => void toggleResults(survey.id)}
                      aria-expanded={open}
                      className="mt-3 min-h-9 px-3 text-caption"
                    >
                      <BarChart3 size={14} /> {open ? "Ocultar resultados" : "Ver resultados"}
                    </DeskButton>

                    {open ? (
                      <div className="mt-4 border-t border-line pt-4">
                        {resultsLoading || !results ? (
                          <div className="space-y-2">{[0, 1].map((i) => <DeskSkeleton key={i} className="h-20" />)}</div>
                        ) : results.responseCount === 0 ? (
                          <p className="text-ui text-muted">Todavía nadie ha respondido.</p>
                        ) : (
                          <div className="grid gap-6">
                            {/* El indice primero: es la lectura de un vistazo.
                                El desglose por pregunta es para actuar. */}
                            <ClimateHeadline results={results} />
                            <div className="grid gap-6 md:grid-cols-2">
                            {results.questions.map((q) => (
                              <div key={q.id}>
                                <p className="text-ui font-medium text-ink">{q.text}</p>
                                {q.type === "RATING" ? (
                                  <div className="mt-2">
                                    <div className="flex items-baseline gap-2">
                                      <Star size={15} className="translate-y-0.5 fill-warn text-warn" aria-hidden />
                                      <span className="text-h3 font-semibold text-ink">
                                        {q.average !== null ? q.average.toFixed(1) : "—"}
                                      </span>
                                      <span className="text-caption text-muted">
                                        promedio · {q.count} respuesta{q.count === 1 ? "" : "s"}
                                      </span>
                                      <LevelChip level={ratingLevel(q.average)} />
                                    </div>
                                    {q.split ? (
                                      <p className="mt-1.5 text-caption text-warn">
                                        El equipo está dividido en esta: el promedio no representa a nadie.
                                      </p>
                                    ) : null}
                                    <div className="mt-2 space-y-1">
                                      {[5, 4, 3, 2, 1].map((star) => {
                                        const n = q.distribution[star - 1] ?? 0;
                                        const w = q.count > 0 ? Math.round((n / q.count) * 100) : 0;
                                        return (
                                          <div key={star} className="flex items-center gap-2 text-caption">
                                            <span className="w-6 shrink-0 text-muted">{star}★</span>
                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
                                              <div className="h-full rounded-full bg-warn" style={{ width: `${w}%` }} />
                                            </div>
                                            <span className="w-6 shrink-0 text-right tabular-nums text-muted">{n}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2 space-y-1.5">
                                    {q.texts.length === 0 ? (
                                      <p className="text-caption text-muted">Sin respuestas de texto.</p>
                                    ) : q.texts.map((t, i) => (
                                      <p key={i} className="rounded-lg bg-panel px-3 py-2 text-ui text-ink">
                                        “{t.text}”{t.name ? <span className="ml-1 text-caption text-muted">— {t.name}</span> : null}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </DeskSection>
      </DeskReveal>

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

const LEVEL_STYLE: Record<ClimateLevel, string> = {
  bueno: "bg-ok/12 text-ok",
  atencion: "bg-warn/12 text-warn",
  critico: "bg-danger/12 text-danger",
  "sin-dato": "bg-panel text-muted"
};

/** Etiqueta de semáforo. Lleva el texto además del color: quien no distingue
 *  bien los colores tiene que poder leerlo igual. */
function LevelChip({ level }: { level: ClimateLevel }) {
  if (level === "sin-dato") return null;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-caption font-semibold", LEVEL_STYLE[level])}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

/**
 * Cabecera de resultados: el índice de clima, su semáforo, la tasa de respuesta
 * y las preguntas peor calificadas.
 *
 * Las peores van aquí arriba a propósito: con doce preguntas, lo que importa no
 * es el promedio general sino por dónde empezar.
 */
function ClimateHeadline({ results }: { results: Results }) {
  const ratings = results.questions.filter(
    (q): q is Extract<ResultQuestion, { type: "RATING" }> => q.type === "RATING"
  );
  const index = results.climateIndex ?? climateIndex(ratings);
  const level = indexLevel(index);
  const rate = responseRate(results.responseCount, results.totalRecipients);
  const worst = worstQuestions(ratings, 3);

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="text-caption font-medium text-muted">Índice de clima</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-h1 font-semibold tabular-nums text-ink">{index ?? "—"}</span>
            <span className="text-ui text-muted">/ 100</span>
            <LevelChip level={level} />
          </div>
        </div>
        <div>
          <p className="text-caption font-medium text-muted">Respondieron</p>
          <p className="mt-1 text-h3 font-semibold tabular-nums text-ink">
            {results.responseCount}/{results.totalRecipients}
            {rate !== null ? <span className="ml-1.5 text-ui font-normal text-muted">{rate}%</span> : null}
          </p>
        </div>
        {results.audience ? (
          <div>
            <p className="text-caption font-medium text-muted">Dirigida a</p>
            <p className="mt-1 text-h3 font-semibold text-ink">{AUDIENCE_LABEL[results.audience]}</p>
          </div>
        ) : null}
      </div>

      {worst.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-caption font-medium text-muted">Por dónde empezar</p>
          <ul className="mt-1.5 grid gap-1">
            {worst.map((q) => (
              <li key={q.id} className="flex items-baseline justify-between gap-3 text-ui">
                <span className="text-ink">{q.text}</span>
                <span className="shrink-0 tabular-nums text-muted">{q.average?.toFixed(1) ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {results.responseCount > 0 && results.responseCount < 3 ? (
        <p className="mt-3 text-caption text-muted">
          Con {results.responseCount} respuesta{results.responseCount === 1 ? "" : "s"} el índice todavía dice poco.
          Espera a que conteste más gente antes de sacar conclusiones.
        </p>
      ) : null}
    </div>
  );
}
