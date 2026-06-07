"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, BookOpen, CalendarDays, CheckCircle2, CheckSquare, ClipboardList, Database, LogOut, Megaphone, Receipt, ShoppingBag, UsersRound } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { completion, money } from "@/lib/format";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing, QuickLink, StatCard, priorityTone } from "@/components/ui";

export default function ManagerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [manager, setManager] = useState<User | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) router.replace("/login");
      else setManager(session);
    });
    fetchAppData().then(setData).catch(() => setData(null));
  }, [router]);

  if (!data) {
    return (
      <>
        <AppHeader title="Cargando" subtitle="Leyendo datos de PostgreSQL." />
        <AppFrame>
          <Card>Conectando con el panel...</Card>
        </AppFrame>
      </>
    );
  }

  const advisors = data.users.filter((user) => user.role === "ASESOR");
  const store = data.kpis.find((item) => item.ranking === 0) ?? data.kpis[0];
  const critical = data.pendings.filter((pending) => pending.priority === "critica" || pending.priority === "alta");
  const doneActivities = data.plans.flatMap((plan) => plan.activities).filter((activity) => activity.completed).length;
  const allActivities = data.plans.flatMap((plan) => plan.activities).length;
  const storeProgress = completion(store?.dailySales ?? 0, store?.dailyGoal ?? 0);
  const activityProgress = allActivities ? Math.round((doneActivities / allActivities) * 100) : 0;
  const ranking = advisors
    .map((advisor) => ({ advisor, kpi: data.kpis.find((item) => item.userId === advisor.id) }))
    .filter((item) => item.kpi)
    .sort((a, b) => (a.kpi?.ranking ?? 99) - (b.kpi?.ranking ?? 99));

  const userName = (id: string) => data.users.find((user) => user.id === id)?.name ?? "Equipo";
  const greeting = manager?.name ? `Hola, ${manager.name}` : "Hola, gerente";

  return (
    <>
      <AppHeader
        title={greeting}
        subtitle="Pulso de tienda, equipo y pendientes criticos."
        avatar={manager?.avatar}
        action={
          <button
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
            className="liquid-glass grid size-11 place-items-center rounded-[22px] text-ink/62 transition active:scale-95"
            aria-label="Cerrar sesion"
          >
            <LogOut size={18} />
          </button>
        }
      />
      <AppFrame>
        <section className="manager-sales-hero mb-3 rounded-[28px] border border-volt/25 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.13em] text-volt/90">Venta tienda</p>
              <h2 className="mt-1 text-[2.25rem] font-black leading-none tracking-[-0.045em] text-ink">{money(store?.dailySales ?? 0)}</h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xs font-bold text-muted">Meta diaria</span>
                <span className="text-sm font-black text-ink/85">{money(store?.dailyGoal ?? 0)}</span>
              </div>
            </div>
            <div className="shrink-0 text-center">
              <ProgressRing value={storeProgress} size={68} />
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-muted">Indicador</p>
            </div>
          </div>
          <ProgressBar value={storeProgress} />
        </section>

        <div className="grid grid-cols-2 gap-3">
          <StatCard compact label="Ventas" value={money(store?.dailySales ?? 0)} detail="Hoy" progress={storeProgress} delta="+12%" icon={<ShoppingBag size={15} />} />
          <StatCard compact label="Tickets" value={String(store?.transactions ?? 0)} detail="Transacciones" tone="sky" icon={<Receipt size={15} />} />
          <StatCard compact label="Equipo" value={String(advisors.length)} detail="Asesores activos" tone="purple" icon={<UsersRound size={15} />} />
          <StatCard compact label="Criticos" value={String(critical.length)} detail="Alta y critica" tone="orchid" progress={Math.min(critical.length * 25, 100)} />
        </div>

        <Card className="mt-3 rounded-[26px]">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="text-volt" size={18} />
              <h2 className="text-lg font-black">Estado tienda</h2>
            </div>
            <Badge tone={storeProgress >= 80 ? "success" : "warn"}>{storeProgress >= 80 ? "en ritmo" : "en seguimiento"}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="border-r border-white/[0.08] px-2 py-1">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">Conversion</p>
              <p className="mt-1 text-xl font-black text-sky">{store?.conversion ?? 0}%</p>
            </div>
            <div className="px-2 py-1">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted">Plan diario</p>
              <p className="mt-1 text-xl font-black text-purple">{activityProgress}%</p>
            </div>
          </div>
        </Card>

        <section className="mt-3 grid grid-cols-2 gap-2">
          <QuickLink href="/plan" icon={CheckSquare} label="Crear plan del dia" />
          <QuickLink href="/pendientes" icon={ClipboardList} label="Crear pendiente" />
          <QuickLink href="/bitacora" icon={BookOpen} label="Bitacora" />
          <QuickLink href="/horarios" icon={CalendarDays} label="Horarios" />
        </section>

        <Card className="mt-3 p-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-volt">
              <Database size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-black tracking-[-0.02em] text-ink">Centro de Datos</h2>
              <p className="mt-0.5 text-xs text-muted">Fuentes y sincronizaciones</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/datos")}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-volt px-3.5 text-xs font-black text-white transition active:scale-95"
            >
              Abrir <ArrowRight size={14} />
            </button>
          </div>
        </Card>

        <Card className="mt-3">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="text-volt" size={18} />
            <h2 className="text-lg font-black">Desempeno equipo</h2>
          </div>
          <p className="text-sm text-muted">{doneActivities} actividades completadas de {allActivities}. Ranking y pendientes se actualizan con datos actuales.</p>
          <ProgressBar value={activityProgress} tone="purple" />
        </Card>

        <Card className="mt-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Ranking asesores</h2>
            <Badge>tienda</Badge>
          </div>
          <div className="mb-2 flex -space-x-3">
            {advisors.map((advisor) => (
              <ProfileAvatar key={advisor.id} name={advisor.name} photoUrl={advisor.photoUrl} size="sm" className="ring-2 ring-card" />
            ))}
          </div>
          <div className="divide-y divide-white/[0.07]">
            {ranking.map(({ advisor, kpi }) => {
              const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
              return (
              <div key={advisor.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <ProfileAvatar name={advisor.name} photoUrl={advisor.photoUrl} size="sm" />
                  <div>
                  <p className="font-bold">#{kpi?.ranking} {advisor.name}</p>
                  <p className="text-sm text-ink/50">{money(kpi?.dailySales ?? 0)} de {money(kpi?.dailyGoal ?? 0)}</p>
                  <div className="max-w-40">
                    <ProgressBar value={progress} />
                  </div>
                  </div>
                </div>
                <p className="text-xl font-black text-volt">{progress}%</p>
              </div>
            );})}
          </div>
        </Card>

        <Card className="mt-3 rounded-[26px]">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="text-volt" size={18} />
            <h2 className="text-lg font-black">Comunicados recientes</h2>
          </div>
          {data.announcements.map((item) => (
            <div key={item.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
              <p className="font-bold">{item.title}</p>
              <p className="mt-1 text-sm text-ink/55">{item.readBy.length} leidos, {advisors.length - item.readBy.length} pendientes</p>
            </div>
          ))}
        </Card>

        <Card className="mt-3">
          <h2 className="mb-3 text-lg font-black">Pendientes de gerencia</h2>
          <div className="divide-y divide-white/[0.07]">
            {critical.map((pending) => (
              <div key={pending.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{pending.title}</p>
                  <Badge tone={priorityTone(pending.priority)}>{pending.priority}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink/55">Responsable: {userName(pending.ownerId)}</p>
              </div>
            ))}
          </div>
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}
