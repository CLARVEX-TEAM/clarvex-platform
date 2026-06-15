"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Moon, Sparkles, SunMedium, Trash2 } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Activity, User } from "@/lib/types";
import { CHORE_LABELS, ROTATING_ORDER } from "@/lib/chore-rules";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { AppButton, AppChipInput, AppDatePicker, AppInput, AppSelect, AppTextarea, type SelectOption } from "@/components/forms";
import { cn } from "@/lib/utils";

const days = ["Hoy", "Man", "Mie", "Jue", "Vie", "Sab", "Dom"];

function groupedActivities(activities: Activity[]) {
  return [
    { label: "Apertura", icon: SunMedium, items: activities.slice(0, 2) },
    { label: "Piso de venta", icon: Flame, items: activities.slice(2, Math.max(2, activities.length - 1)) },
    { label: "Cierre", icon: Moon, items: activities.slice(Math.max(2, activities.length - 1)) }
  ].filter((group) => group.items.length > 0);
}

export default function PlanPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [session, setSession] = useState<User | null>(null);
  const [selectedDay, setSelectedDay] = useState("Hoy");
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyGoal, setDailyGoal] = useState("");
  const [focus, setFocus] = useState("");
  const [message, setMessage] = useState("");
  const [activityChips, setActivityChips] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [genDate, setGenDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [genSaved, setGenSaved] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <>
        <AppHeader title="Plan del dia" subtitle="Cargando planes desde PostgreSQL." backHref="/manager" />
        <AppFrame><Card>Conectando...</Card></AppFrame>
        <BottomNav />
      </>
    );
  }

  const advisors = data.users.filter((user) => user.role === "ASESOR");
  const advisorOptions: SelectOption[] = advisors.map((a) => ({
    value: a.id,
    label: a.name,
    description: "Asesor",
    photoUrl: a.photoUrl ?? null,
  }));
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const planUser = (id: string) => data.users.find((user) => user.id === id);
  const isAdvisor = session?.role === "ASESOR";
  const visiblePlans = isAdvisor && session ? data.plans.filter((plan) => plan.userId === session.id) : data.plans;
  const totalActivities = visiblePlans.flatMap((plan) => plan.activities);
  const completed = totalActivities.filter((a) => a.completed).length;
  const dayProgress = totalActivities.length ? Math.round((completed / totalActivities.length) * 100) : 0;

  async function deletePlan(id: string) {
    if (!data) return;
    if (!window.confirm("¿Eliminar este plan del dia? Esta accion no se puede deshacer.")) return;
    const previous = data.plans;
    setData({ ...data, plans: data.plans.filter((plan) => plan.id !== id) });
    try {
      const response = await fetch(`/api/plans/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo eliminar.");
    } catch {
      setData({ ...data, plans: previous });
      setFormStatus("No se pudo eliminar el plan.");
    }
  }

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting) return;
    if (activityChips.length === 0) { setFormStatus("Agrega al menos una actividad."); return; }
    setSubmitting(true);
    setFormStatus("Guardando...");
    try {
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date, dailyGoal: Number(dailyGoal), focus, message, activities: activityChips })
      });
      const payload = await response.json() as { plan?: AppData["plans"][number]; error?: string };
      if (!response.ok || !payload.plan) { setFormStatus(payload.error ?? "No se pudo crear el plan."); return; }
      setData({ ...data, plans: [payload.plan, ...data.plans] });
      setDailyGoal(""); setFocus(""); setMessage(""); setActivityChips([]); setUserId(""); setFormStatus("Plan creado.");
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch {
      setFormStatus("No se pudo crear el plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function generateDay() {
    if (!data || generating) return;
    setGenerating(true); setGenStatus("");
    try {
      const res = await fetch("/api/plans/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: genDate }) });
      const payload = await res.json() as { ok?: boolean; generated?: number; error?: string };
      if (!res.ok || !payload.ok) { setGenStatus(payload.error ?? "No se pudieron generar las actividades."); return; }
      setData(await fetchAppData());
      setGenStatus(payload.generated ? `Actividades generadas para ${payload.generated} asesor(es).` : "No hay asesores trabajando ese día.");
      setGenSaved(true); setTimeout(() => setGenSaved(false), 1600);
    } catch {
      setGenStatus("No se pudieron generar las actividades.");
    } finally {
      setGenerating(false);
    }
  }

  async function reassignChore(choreKey: string, toUserId: string) {
    if (!data || !toUserId) return;
    try {
      const res = await fetch("/api/plans/chores", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: genDate, choreKey, toUserId }) });
      const payload = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) { setGenStatus(payload.error ?? "No se pudo reasignar la tarea."); return; }
      setData(await fetchAppData());
    } catch {
      setGenStatus("No se pudo reasignar la tarea.");
    }
  }

  async function publishDay() {
    if (!data || publishing) return;
    setPublishing(true); setGenStatus("");
    try {
      const res = await fetch("/api/plans/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: genDate }) });
      const payload = await res.json() as { ok?: boolean; published?: number; error?: string };
      if (!res.ok || !payload.ok) { setGenStatus(payload.error ?? "No se pudo enviar el plan."); return; }
      setData(await fetchAppData());
      setGenStatus(payload.published ? `Plan enviado a ${payload.published} asesor(es).` : "No había borradores por enviar.");
      setPublished(true); setTimeout(() => setPublished(false), 1600);
    } catch {
      setGenStatus("No se pudo enviar el plan.");
    } finally {
      setPublishing(false);
    }
  }

  // Tareas operativas rotativas ya generadas para el día seleccionado (autoKey → asesor asignado).
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
      <AppHeader
        title="Plan del dia"
        subtitle={isAdvisor ? "Tu meta, enfoque y checklist." : "Metas, enfoque y checklist por asesor."}
        backHref={isAdvisor ? "/advisor" : "/manager"}
      />
      <AppFrame>
        {/* ── Day tabs ── */}
        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {days.map((day) => (
            <motion.button
              key={day}
              onClick={() => setSelectedDay(day)}
              whileTap={{ scale: 0.93 }}
              className="relative min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black tracking-[-0.01em] transition"
            >
              {selectedDay === day ? (
                <motion.span
                  layoutId="plan-day-active"
                  className="absolute inset-0 rounded-full bg-[#2563EB] shadow-[0_6px_16px_rgba(37,99,235,0.28)]"
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <span className={cn("relative", selectedDay === day ? "text-white" : "text-muted hover:text-ink")}>
                {day}
              </span>
            </motion.button>
          ))}
        </div>

        {/* ── Progress card ── */}
        <div className="premium-hero mb-3 rounded-[28px] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2563EB]">Progreso del dia</p>
              <h2 className="mt-1 text-[2.4rem] font-black leading-none tracking-[-0.05em] text-slate-900 dark:text-white">
                {dayProgress}%
              </h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {completed} de {totalActivities.length} actividades completadas
              </p>
            </div>
            <ProgressRing value={dayProgress} size={72} />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-[#2a3a5c]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400"
              initial={{ width: 0 }}
              animate={{ width: `${dayProgress}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* ── Actividades automáticas ── */}
        {!isAdvisor ? (
          <Card className="mb-3">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="text-volt" size={18} />
              <h2 className="text-lg font-black">Actividades automáticas</h2>
            </div>
            <p className="mb-3 text-sm text-muted">
              Asigna cíclico, limpieza y visual según las reglas de la tienda, rotando de forma justa entre los asesores que trabajan ese día.
            </p>
            <div className="grid gap-3">
              <AppDatePicker label="Día" value={genDate} onChange={setGenDate} />
              <AppButton type="button" variant="secondary" onClick={() => void generateDay()} loading={generating} success={genSaved} icon={<Sparkles size={17} />} className="w-full">
                Generar actividades del día
              </AppButton>
              {generatedChores.length > 0 ? (
                <div className="grid gap-2 border-t border-line pt-3">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">Reasignar tareas operativas</p>
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
              {draftCount > 0 ? (
                <AppButton type="button" variant="primary" onClick={() => void publishDay()} loading={publishing} success={published} className="w-full">
                  Enviar al equipo ({draftCount} {draftCount === 1 ? "borrador" : "borradores"})
                </AppButton>
              ) : null}
              {genStatus ? <p className="text-sm font-semibold text-muted">{genStatus}</p> : null}
            </div>
          </Card>
        ) : null}

        {/* ── Crear plan ── */}
        {!isAdvisor ? (
          <Card className="mb-3">
            <h2 className="mb-4 text-lg font-black">Crear plan</h2>
            <form className="grid gap-3" onSubmit={createPlan}>
              <div className="grid grid-cols-2 gap-3">
                <AppDatePicker label="Fecha" value={date} onChange={setDate} required />
                <AppInput
                  label="Meta del dia"
                  type="number"
                  min="0"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  required
                />
              </div>
              <AppSelect
                label="Asesor"
                value={userId}
                onChange={setUserId}
                options={advisorOptions}
                placeholder="Selecciona asesor"
              />
              <AppInput
                label="Enfoque del dia"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                required
              />
              <AppTextarea
                label="Mensaje personalizado"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
              <AppChipInput
                label="Actividades"
                chips={activityChips}
                onChipsChange={setActivityChips}
              />
              {formStatus ? (
                <p className={`text-sm font-semibold ${formStatus === "Plan creado." ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}>
                  {formStatus}
                </p>
              ) : null}
              <AppButton type="submit" variant="primary" loading={submitting} success={saved} className="w-full">
                Crear plan
              </AppButton>
            </form>
          </Card>
        ) : null}

        {/* ── Plan cards ── */}
        <div className="space-y-2.5">
          {visiblePlans.map((plan) => {
            const planProgress = plan.activities.length
              ? Math.round((plan.activities.filter((a) => a.completed).length / plan.activities.length) * 100)
              : 0;
            return (
              <Card key={plan.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProfileAvatar name={userName(plan.userId)} photoUrl={planUser(plan.userId)?.photoUrl} size="sm" className="rounded-full shadow-none" />
                    <div>
                      <h2 className="truncate text-xl font-black">{userName(plan.userId)}</h2>
                      <p className="text-sm text-muted">{plan.date}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!isAdvisor && plan.published === false ? <Badge tone="warn">Borrador</Badge> : null}
                    <Badge>{money(plan.dailyGoal)}</Badge>
                    {!isAdvisor ? (
                      <button
                        onClick={() => void deletePlan(plan.id)}
                        className="grid size-9 place-items-center rounded-xl border border-rose-200/60 bg-rose-50/60 text-rose-600 transition active:scale-95"
                        aria-label="Eliminar plan"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="font-semibold text-volt">{plan.focus}</p>
                <p className="mt-2 text-sm text-muted">{plan.message}</p>
                <ProgressBar value={planProgress} />
                <div className="mt-2.5 space-y-2.5">
                  {groupedActivities(plan.activities).map((group) => (
                    <section key={group.label}>
                      <div className="mb-2 flex items-center gap-2 text-sm font-black text-ink">
                        <group.icon className="text-volt" size={17} />
                        {group.label}
                      </div>
                      <TaskList activities={group.items} />
                    </section>
                  ))}
                </div>
              </Card>
            );
          })}
          {visiblePlans.length === 0 ? (
            <Card>
              <p className="font-black">Sin plan asignado</p>
              <p className="mt-2 text-sm text-muted">Cuando gerencia cree tu plan del dia, aparecera aqui con checklist y meta.</p>
            </Card>
          ) : null}
        </div>
      </AppFrame>
      <BottomNav />
    </>
  );
}

