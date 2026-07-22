"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Flame, Moon, Plus, Sparkles, SunMedium } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { money } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { CHORE_LABELS, ROTATING_ORDER } from "@/lib/chore-rules";
import { Badge, Card, EmptyState, ProfileAvatar, ProgressBar, ProgressRing, Skeleton } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { DeleteButton, SaveButton } from "@/components/ActionButtons";
import { SendButton } from "@/components/SendButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { AppButton, AppChipInput, AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { useDesktopData } from "@/components/desktop/useDesktopData";
import { DesktopError } from "@/components/desktop/DesktopError";

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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyGoal, setDailyGoal] = useState("");
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState("");
  const [activityChips, setActivityChips] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [genDate, setGenDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [genSaved, setGenSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (error && !data) return <DesktopError onRetry={reload} />;

  if (!data) {
    return (
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-2 space-y-3"><Skeleton className="h-64 rounded-[28px]" /><Skeleton className="h-80 rounded-[28px]" /></div>
        <div className="col-span-3 space-y-3"><Skeleton className="h-28 rounded-[28px]" /><Skeleton className="h-44 rounded-[28px]" /></div>
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
    <div className="grid grid-cols-5 gap-5">
      {/* Panel de gestión */}
      <div className="col-span-2 space-y-4">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="text-volt" size={18} />
            <h2 className="text-lg font-semibold text-ink">Actividades automáticas</h2>
          </div>
          <p className="mb-3 text-sm text-muted">Asigna cíclico, limpieza y visual según las reglas de la tienda, rotando de forma justa entre los asesores del día.</p>
          <div className="grid gap-3">
            <AppDatePicker label="Día" value={genDate} onChange={setGenDate} />
            <AppButton type="button" variant="secondary" onClick={() => void generateDay()} loading={generating} success={genSaved} icon={<Sparkles size={17} />} className="w-full">
              Generar actividades del día
            </AppButton>
            {generatedChores.length > 0 ? (
              <div className="grid gap-2 border-t border-line pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Reasignar tareas operativas</p>
                {generatedChores.map((key) => (
                  <AppSelect key={key} label={CHORE_LABELS[key]} value={choreAssignedTo[key]} onChange={(value) => void reassignChore(key, value)} options={advisorOptions} placeholder="Asignar a…" />
                ))}
              </div>
            ) : null}
            {draftCount > 0 ? (
              <SendButton type="button" onClick={() => void publishDay()} loading={publishing} success={published} sentLabel="¡Enviado!" className="w-full">
                Enviar al equipo ({draftCount} {draftCount === 1 ? "borrador" : "borradores"})
              </SendButton>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-ink">Crear plan</h2>
          <form className="grid gap-3" onSubmit={createPlan}>
            <div className="grid grid-cols-2 gap-3">
              <AppDatePicker label="Fecha" value={date} onChange={setDate} required />
              <AppInput label="Meta del día" type="number" min="0" value={dailyGoal} onChange={(e) => setDailyGoal(e.target.value)} required />
            </div>
            <AppSelect label="Asesor" value={userId} onChange={setUserId} options={advisorOptions} placeholder="Selecciona asesor" />
            <AppInput label="Enfoque del día" value={focus} onChange={(e) => setFocus(e.target.value)} required />
            <AppTextarea label="Mensaje personalizado" value={message} onChange={(e) => setMessage(e.target.value)} required />
            <AppChipInput label="Actividades" chips={activityChips} onChipsChange={setActivityChips} />
            <SaveButton type="submit" loading={submitting} success={saved} savedLabel="¡Creado!" className="w-full">Crear plan</SaveButton>
          </form>
        </Card>
      </div>

      {/* Planes */}
      <div className="col-span-3 space-y-3">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-volt">Progreso del día</p>
              <h2 className="mt-1 text-[2.6rem] font-semibold leading-none tracking-[-0.05em] text-ink">{dayProgress}%</h2>
              <p className="mt-1 text-xs font-semibold text-muted">{completed} de {totalActivities.length} actividades completadas</p>
            </div>
            <ProgressRing value={dayProgress} size={84} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-[#23242A]">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" initial={{ width: 0 }} animate={{ width: `${dayProgress}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </Card>

        {visiblePlans.map((plan) => {
          const planProgress = plan.activities.length ? Math.round((plan.activities.filter((a) => a.completed).length / plan.activities.length) * 100) : 0;
          return (
            <Card key={plan.id} className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar name={userName(plan.userId)} photoUrl={planUser(plan.userId)?.photoUrl} size="sm" className="rounded-full shadow-none" />
                  <div>
                    <h2 className="truncate text-xl font-semibold text-ink">{userName(plan.userId)}</h2>
                    <p className="text-sm text-muted">{plan.date}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {plan.published === false ? <Badge tone="warn">Borrador</Badge> : null}
                  <Badge>{money(plan.dailyGoal)}</Badge>
                  <DeleteButton iconOnly onClick={() => setPendingDeleteId(plan.id)} className="size-9 border border-rose-200/60 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10" aria-label="Eliminar plan" />
                </div>
              </div>
              <p className="font-semibold text-volt">{plan.focus}</p>
              <p className="mt-2 text-sm text-muted">{plan.message}</p>
              <ProgressBar value={planProgress} />
              <div className="mt-2.5 space-y-2.5">
                {groupedActivities(plan.activities).map((group) => (
                  <section key={group.label}>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                      <group.icon className="text-volt" size={17} />
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
            </Card>
          );
        })}
        {visiblePlans.length === 0 ? (
          <Card className="p-5"><EmptyState icon={ClipboardList} title="Sin planes todavía" description="Genera las actividades del día o crea un plan manual para empezar." /></Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="¿Eliminar plan del día?"
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => void confirmDeletePlan()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
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
    <div className="flex gap-2 border-t border-line pt-2.5">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }}
        maxLength={300}
        placeholder="Agregar actividad…"
        className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 text-sm font-semibold text-ink outline-none focus:border-volt"
      />
      <button type="button" onClick={() => void add()} disabled={saving || title.trim().length < 3} className="tappable grid size-10 shrink-0 place-items-center rounded-xl bg-volt text-white transition active:scale-95 disabled:opacity-40" aria-label="Agregar actividad">
        <Plus size={18} />
      </button>
    </div>
  );
}
