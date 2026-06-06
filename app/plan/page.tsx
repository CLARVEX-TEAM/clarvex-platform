"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Flame, Moon, SunMedium } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Activity, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Button, Card, ProgressBar, ProgressRing } from "@/components/ui";
import { TaskList } from "@/components/TaskList";

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
  const [activities, setActivities] = useState("");
  const [formStatus, setFormStatus] = useState("");

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
  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const isAdvisor = session?.role === "ASESOR";
  const visiblePlans = isAdvisor && session ? data.plans.filter((plan) => plan.userId === session.id) : data.plans;
  const totalActivities = visiblePlans.flatMap((plan) => plan.activities);
  const dayProgress = totalActivities.length ? Math.round((totalActivities.filter((activity) => activity.completed).length / totalActivities.length) * 100) : 0;

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setFormStatus("Guardando...");
    const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, date, dailyGoal: Number(dailyGoal), focus, message, activities: activities.split("\n").map((item) => item.trim()).filter(Boolean) }) });
    const payload = await response.json() as { plan?: AppData["plans"][number]; error?: string };
    if (!response.ok || !payload.plan) { setFormStatus(payload.error ?? "No se pudo crear el plan."); return; }
    setData({ ...data, plans: [payload.plan, ...data.plans] });
    setDailyGoal(""); setFocus(""); setMessage(""); setActivities(""); setFormStatus("Plan creado.");
  }

  return (
    <>
      <AppHeader title="Plan del dia" subtitle={isAdvisor ? "Tu meta, enfoque y checklist." : "Metas, enfoque y checklist por asesor."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
        <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`min-h-10 shrink-0 rounded-full px-3 text-[13px] font-black tracking-[-0.01em] transition active:scale-95 ${selectedDay === day ? "bg-volt text-white shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]" : "text-muted hover:text-ink"}`}
            >
              {day}
            </button>
          ))}
        </div>

        <Card className="mb-3 border-volt/25 bg-volt/[0.045] py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">Progreso del dia</p>
              <h2 className="mt-1 text-3xl font-black text-ink">{dayProgress}%</h2>
              <p className="mt-1 text-xs text-muted">{totalActivities.filter((activity) => activity.completed).length} de {totalActivities.length} actividades</p>
            </div>
            <ProgressRing value={dayProgress} size={64} />
          </div>
          <ProgressBar value={dayProgress} />
        </Card>

        {!isAdvisor ? (
          <Card className="mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-volt" size={18} />
              <h2 className="text-lg font-black">Crear plan</h2>
            </div>
            <form className="mt-3 grid gap-2.5" onSubmit={createPlan}>
              <input type="date" className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Fecha" required />
              <select value={userId} onChange={(event) => setUserId(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" aria-label="Asesor" required>
                <option value="">Selecciona asesor</option>{advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
              </select>
              <input type="number" min="0" value={dailyGoal} onChange={(event) => setDailyGoal(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" placeholder="Meta del dia" required />
              <input value={focus} onChange={(event) => setFocus(event.target.value)} className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" placeholder="Enfoque del dia" required />
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-20 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" placeholder="Mensaje personalizado" required />
              <textarea value={activities} onChange={(event) => setActivities(event.target.value)} className="min-h-24 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" placeholder={"Actividades, una por linea"} required />
              {formStatus ? <p className="text-sm font-semibold text-muted">{formStatus}</p> : null}
              <Button type="submit" className="w-full">Crear plan</Button>
            </form>
          </Card>
        ) : null}

        <div className="space-y-2.5">
          {visiblePlans.map((plan) => {
            const planProgress = plan.activities.length ? Math.round((plan.activities.filter((activity) => activity.completed).length / plan.activities.length) * 100) : 0;
            return (
              <Card key={plan.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">{userName(plan.userId)}</h2>
                    <p className="text-sm text-muted">{plan.date}</p>
                  </div>
                  <Badge>{money(plan.dailyGoal)}</Badge>
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
