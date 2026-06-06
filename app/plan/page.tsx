"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Flame, Moon, SunMedium } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { money } from "@/lib/format";
import type { Activity, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProgressBar, ProgressRing } from "@/components/ui";
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

  useEffect(() => {
    setSession(getSession());
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

  return (
    <>
      <AppHeader title="Plan del dia" subtitle={isAdvisor ? "Tu meta, enfoque y checklist." : "Metas, enfoque y checklist por asesor."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
        <div className="no-scrollbar tab-glass-shell -mx-1 mb-5 flex gap-1 overflow-x-auto overflow-y-hidden p-1.5 scroll-px-4">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black tracking-[-0.01em] transition active:scale-95 ${selectedDay === day ? "bg-volt text-void shadow-[0_14px_34px_rgb(34_197_94_/_0.24),inset_0_1px_0_rgb(255_255_255_/_0.36)]" : "text-muted hover:text-ink"}`}
            >
              {day}
            </button>
          ))}
        </div>

        <Card className="mb-5 border-volt/25 bg-volt/[0.045]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">Progreso del dia</p>
              <h2 className="mt-2 text-4xl font-black text-ink">{dayProgress}%</h2>
              <p className="mt-1 text-sm text-muted">{totalActivities.filter((activity) => activity.completed).length} de {totalActivities.length} actividades</p>
            </div>
            <ProgressRing value={dayProgress} />
          </div>
          <ProgressBar value={dayProgress} />
        </Card>

        {!isAdvisor ? (
          <Card className="mb-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-volt" size={18} />
              <h2 className="text-lg font-black">Crear plan</h2>
            </div>
            <div className="mt-4 grid gap-3">
              <input className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" value="2026-06-05" readOnly aria-label="Fecha" />
              <select className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" aria-label="Asesor">
                {advisors.map((advisor) => <option key={advisor.id}>{advisor.name}</option>)}
              </select>
              <input className="min-h-12 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" placeholder="Meta del dia" value="$22,000" readOnly />
              <textarea className="min-h-24 rounded-2xl border border-line bg-panel px-3 py-3 text-ink outline-none focus:border-volt" placeholder="Enfoque y mensaje personalizado" value="Elevar conversion en probador y cerrar accesorios." readOnly />
            </div>
          </Card>
        ) : null}

        <div className="space-y-4">
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
                <div className="mt-4 space-y-4">
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
