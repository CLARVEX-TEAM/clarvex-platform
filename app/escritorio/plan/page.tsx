"use client";

import { useState } from "react";
import { dashboardDateKey } from "@/lib/dashboard-kpi";
import { ClipboardList, Flame, Moon, Plus, Sparkles, SunMedium } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { money } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { CHORE_LABELS, ROTATING_ORDER } from "@/lib/chore-rules";
import { Badge, ProfileAvatar } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { DeleteButton } from "@/components/ActionButtons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { AppChipInput, AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";
import {
  DeskButton, DeskEmpty, DeskMeter, DeskPanel, DeskPrimaryButton, DeskReveal, DeskRule,
  DeskSection, DeskSkeleton, deskInput
} from "@/components/desktop/DeskUI";

function groupedActivities(activities: Activity[]) {
  return [
    { label: "Apertura", icon: SunMedium, items: activities.slice(0, 2) },
    { label: "Piso de venta", icon: Flame, items: activities.slice(2, Math.max(2, activities.length - 1)) },
    { label: "Cierre", icon: Moon, items: activities.slice(Math.max(2, activities.length - 1)) }
  ].filter((group) => group.items.length > 0);
}

export default function EscritorioPlan() {
  const { data, setData, error, reload } = useDesktopData();
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(dashboardDateKey());
  const [dailyGoal, setDailyGoal] = useState("");
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState("");
  const [activityChips, setActivityChips] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [genDate, setGenDate] = useState(dashboardDateKey());
  const [generating, setGenerating] = useState(false);
  const [genSaved, setGenSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (error && !data) return <DesktopError onRetry={reload} />;

  if (!data) {
    return (
      <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4"><DeskSkeleton className="h-56" /><DeskSkeleton className="h-80" /></div>
        <div className="space-y-4"><DeskSkeleton className="h-24" /><DeskSkeleton className="h-56" /><DeskSkeleton className="h-56" /></div>
      </div>
    );
  }

  const advisors = data.users.filter((user) => user.role === "ASESOR");
  const advisorOptions: SelectOption[] = advisors.map((a) => ({ value: a.id, label: a.name, description: "Asesor", photoUrl: a.photoUrl ?? null }));
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const planUser = (id: string) => data.users.find((user) => user.id === id);
  const visiblePlans = data.plans;
  const totalActivities = visiblePlans.flatMap((plan) => plan.activities);
  const completed = totalActivities.filter((a) => a.completed).length;
  const dayProgress = totalActivities.length ? Math.round((completed / totalActivities.length) * 100) : 0;

  async function confirmDeletePlan() {
    const id = pendingDeleteId;
    if (!data || !id) return;
    setDeleting(true);
    const previous = data.plans;
    setData({ ...data, plans: data.plans.filter((plan) => plan.id !== id) });
    try {
      const response = await fetch(`/api/plans/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
    } catch {
      setData({ ...data, plans: previous });
      toast("No se pudo eliminar el plan.", "error");
    } finally {
      setDeleting(false);
      setPendingDeleteId(null);
    }
  }

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting) return;
    if (activityChips.length === 0) { toast("Agrega al menos una actividad.", "error"); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date, dailyGoal: Number(dailyGoal) || 0, focus, message, activities: activityChips })
      });
      const payload = await response.json() as { plan?: AppData["plans"][number]; error?: string };
      if (!response.ok || !payload.plan) { toast(payload.error ?? "No se pudo crear el plan.", "error"); return; }
      setData({ ...data, plans: [payload.plan, ...data.plans] });
      setDailyGoal(""); setFocus(""); setMessage(""); setActivityChips([]); setUserId("");
      toast("Plan creado.", "success");
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      toast("No se pudo crear el plan.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function generateDay() {
    if (!data || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/plans/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: genDate }) });
      const payload = await res.json() as { ok?: boolean; generated?: number; error?: string };
      if (!res.ok || !payload.ok) { toast(payload.error ?? "No se pudieron generar las actividades.", "error"); return; }
      setData(await fetchAppData());
      toast(payload.generated ? `Actividades generadas para ${payload.generated} asesor(es).` : "No hay asesores trabajando ese día.", payload.generated ? "success" : "info");
      setGenSaved(true); setTimeout(() => setGenSaved(false), 1600);
    } catch {
      toast("No se pudieron generar las actividades.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function reassignChore(choreKey: string, toUserId: string) {
    if (!data || !toUserId) return;
    try {
      const res = await fetch("/api/plans/chores", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: genDate, choreKey, toUserId }) });
      const payload = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) { toast(payload.error ?? "No se pudo reasignar la tarea.", "error"); return; }
      setData(await fetchAppData());
    } catch {
      toast("No se pudo reasignar la tarea.", "error");
    }
  }

  async function publishDay() {
    if (!data || publishing) return;
    setPublishing(true);
    try {
      const res = await fetch("/api/plans/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: genDate }) });
      const payload = await res.json() as { ok?: boolean; published?: number; error?: string };
      if (!res.ok || !payload.ok) { toast(payload.error ?? "No se pudo enviar el plan.", "error"); return; }
      setData(await fetchAppData());
      toast(payload.published ? `Plan enviado a ${payload.published} asesor(es).` : "No había borradores por enviar.", payload.published ? "success" : "info");
      setPublished(true); setTimeout(() => setPublished(false), 1600);
    } catch {
      toast("No se pudo enviar el plan.", "error");
    } finally {
      setPublishing(false);
    }
  }

  const genPlans = data.plans.filter((plan) => plan.date === genDate);
  const choreAssignedTo: Record<string, string> = {};
  for (const plan of genPlans) {
    for (const activity of plan.activities) {
      if (activity.autoKey && activity.autoKey !== "VISUAL") choreAssignedTo[activity.autoKey] = plan.userId;
    }
  }
  const generatedChores = ROTATING_ORDER.filter((key) => choreAssignedTo[key]);
  const draftCount = genPlans.filter((plan) => plan.published === false).length;

  return (
    <>
      <div className="grid gap-10 xl:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Panel de gestión */}
        <DeskReveal index={0}>
          <div className="space-y-8 xl:sticky xl:top-20">
            <DeskSection
              title="Actividades automáticas"
              hint="Cíclico, limpieza y visual según las reglas de tienda, rotando de forma justa entre los asesores del día."
            >
              <DeskPanel>
                <div className="grid gap-3">
                  <AppDatePicker label="Día" value={genDate} onChange={setGenDate} />
                  <DeskButton type="button" onClick={() => void generateDay()} disabled={generating} className="w-full">
                    <Sparkles size={15} className="text-accent" />
                    {generating ? "Generando…" : genSaved ? "¡Generado!" : "Generar actividades del día"}
                  </DeskButton>

                  {generatedChores.length > 0 ? (
                    <div className="grid gap-2 border-t border-line pt-3">
                      <p className="text-caption font-medium text-muted">Reasignar tareas operativas</p>
                      {generatedChores.map((key) => (
                        <AppSelect
                          key={key}
                          label={CHORE_LABELS[key]}
                          value={choreAssignedTo[key]}
                          onChange={(value) => void reassignChore(key, value)}
                          options={advisorOptions}
                          placeholder="Asignar a…"
                        />
                      ))}
                    </div>
                  ) : null}

                  {/* LA acción principal de la pantalla: lo que sale del
                      escritorio y llega al teléfono del equipo. */}
                  {draftCount > 0 ? (
                    <DeskPrimaryButton type="button" onClick={() => void publishDay()} disabled={publishing} className="w-full">
                      {publishing ? "Enviando…" : published ? "¡Enviado!" : `Enviar al equipo · ${draftCount} ${draftCount === 1 ? "borrador" : "borradores"}`}
                    </DeskPrimaryButton>
                  ) : null}
                </div>
              </DeskPanel>
            </DeskSection>

            <DeskSection title="Crear plan a mano">
              <DeskPanel>
                <form className="grid gap-3" onSubmit={createPlan}>
                  <div className="grid grid-cols-2 gap-3">
                    <AppDatePicker label="Fecha" value={date} onChange={setDate} required />
                    <AppInput label="Meta del día" type="number" min="0" value={dailyGoal} onChange={(e) => setDailyGoal(e.target.value)} required />
                  </div>
                  <AppSelect label="Asesor" value={userId} onChange={setUserId} options={advisorOptions} placeholder="Selecciona asesor" />
                  <AppInput label="Enfoque del día" value={focus} onChange={(e) => setFocus(e.target.value)} required />
                  <AppTextarea label="Mensaje personalizado" value={message} onChange={(e) => setMessage(e.target.value)} required />
                  <AppChipInput label="Actividades" chips={activityChips} onChipsChange={setActivityChips} />
                  <DeskButton type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Creando…" : saved ? "¡Creado!" : "Crear plan"}
                  </DeskButton>
                </form>
              </DeskPanel>
            </DeskSection>
          </div>
        </DeskReveal>

        {/* Planes */}
        <DeskReveal index={1}>
          <div className="space-y-8">
            <section>
              <h2 className="text-ui font-medium text-muted">Progreso del día</h2>
              <p className="mt-2 text-metric font-semibold text-ink">{dayProgress}%</p>
              <p className="mt-2 text-ui text-ink-2">
                {completed} de {totalActivities.length} actividades completadas
              </p>
              <DeskMeter value={dayProgress} className="mt-4 max-w-2xl" />
            </section>

            <DeskRule />

            <DeskSection title={`Planes · ${visiblePlans.length}`}>
              {visiblePlans.length === 0 ? (
                <DeskEmpty
                  icon={ClipboardList}
                  title="Sin planes todavía"
                  hint="Genera las actividades del día con las reglas de tienda, o crea un plan a mano desde la izquierda."
                />
              ) : (
                <div className="space-y-4">
                  {visiblePlans.map((plan) => {
                    const planProgress = plan.activities.length
                      ? Math.round((plan.activities.filter((a) => a.completed).length / plan.activities.length) * 100)
                      : 0;
                    return (
                      <article key={plan.id} className="rounded-xl border border-line bg-card p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProfileAvatar name={userName(plan.userId)} photoUrl={planUser(plan.userId)?.photoUrl} size="sm" className="size-9 shrink-0 rounded-lg text-[11px] shadow-none" />
                            <div className="min-w-0">
                              <h3 className="truncate text-lead font-semibold text-ink">{userName(plan.userId)}</h3>
                              <p className="text-caption text-muted">{plan.date}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {plan.published === false ? <Badge tone="warn">Borrador</Badge> : null}
                            <Badge>{money(plan.dailyGoal)}</Badge>
                            <DeleteButton
                              iconOnly
                              onClick={() => setPendingDeleteId(plan.id)}
                              className="size-8 border border-line bg-panel"
                              aria-label={`Eliminar plan de ${userName(plan.userId)}`}
                            />
                          </div>
                        </div>

                        <p className="mt-3 text-ui font-medium text-accent">{plan.focus}</p>
                        <p className="mt-1 max-w-[70ch] text-ui text-muted">{plan.message}</p>

                        <div className="mt-3 flex items-center gap-3">
                          <DeskMeter value={planProgress} className="flex-1" />
                          <span className="w-10 shrink-0 text-right text-caption font-medium text-ink">{planProgress}%</span>
                        </div>

                        <div className="mt-4 space-y-3">
                          {groupedActivities(plan.activities).map((group) => (
                            <section key={group.label}>
                              <div className="mb-2 flex items-center gap-2 text-caption font-medium text-muted">
                                <group.icon size={14} />
                                {group.label}
                              </div>
                              <TaskList
                                key={group.items.map((a) => a.id).join("-")}
                                activities={group.items}
                                canDelete
                                onDeleted={(activityId) => setData((current) => current ? { ...current, plans: current.plans.map((p) => p.id === plan.id ? { ...p, activities: p.activities.filter((a) => a.id !== activityId) } : p) } : current)}
                              />
                            </section>
                          ))}
                          <AddActivity
                            planId={plan.id}
                            onAdded={(activity) => setData((current) => current ? { ...current, plans: current.plans.map((p) => p.id === plan.id ? { ...p, activities: [...p.activities, activity] } : p) } : current)}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </DeskSection>
          </div>
        </DeskReveal>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar plan del día?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDeletePlan()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

function AddActivity({ planId, onAdded }: { planId: string; onAdded: (activity: Activity) => void }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function add() {
    const value = title.trim();
    if (value.length < 3) { toast("La actividad debe tener al menos 3 caracteres.", "error"); return; }
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/plans/${planId}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: value }) });
      const payload = await res.json() as { activity?: Activity; error?: string };
      if (!res.ok || !payload.activity) { toast(payload.error ?? "No se pudo agregar la actividad.", "error"); return; }
      onAdded(payload.activity);
      setTitle("");
      toast("Actividad agregada.", "success");
    } catch {
      toast("No se pudo agregar la actividad.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-2 border-t border-line pt-3">
      <label className="sr-only" htmlFor={`add-${planId}`}>Agregar actividad</label>
      <input
        id={`add-${planId}`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }}
        maxLength={300}
        placeholder="Agregar actividad…"
        className={`${deskInput} min-w-0 flex-1`}
      />
      <button
        type="button"
        onClick={() => void add()}
        disabled={saving || title.trim().length < 3}
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent transition-opacity disabled:opacity-40"
        aria-label="Agregar actividad"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
