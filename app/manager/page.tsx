"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarDays, CheckSquare, ClipboardList, LogOut, Megaphone, Receipt, ShoppingBag, UsersRound } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { completion, money } from "@/lib/format";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProgressBar, ProgressRing, QuickLink, StatCard, priorityTone } from "@/components/ui";

export default function ManagerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
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
  const manager = getSession();

  return (
    <>
      <AppHeader
        title="Dashboard gerente"
        subtitle="Pulso de tienda, equipo y pendientes criticos."
        avatar={manager?.avatar}
        action={
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="liquid-glass grid size-11 place-items-center rounded-xl text-ink/62"
            aria-label="Cerrar sesion"
          >
            <LogOut size={18} />
          </button>
        }
      />
      <AppFrame>
        <Card className="mb-4 overflow-hidden border-volt/25 bg-volt/[0.045]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">Meta diaria tienda</p>
              <h2 className="mt-2 text-4xl font-black tracking-tight text-ink">{money(store?.dailySales ?? 0)}</h2>
              <p className="mt-1 text-sm text-ink/58">Meta diaria {money(store?.dailyGoal ?? 0)}</p>
            </div>
            <ProgressRing value={storeProgress} />
          </div>
          <ProgressBar value={storeProgress} />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Ventas" value={money(store?.dailySales ?? 0)} detail="Hoy" progress={storeProgress} delta="+12%" icon={<ShoppingBag size={17} />} />
          <StatCard label="Tickets" value={String(store?.transactions ?? 0)} detail="Transacciones" tone="mint" icon={<Receipt size={17} />} />
          <StatCard label="Clientes" value={`${store?.conversion ?? 0}%`} detail="Conversion" tone="ember" progress={store?.conversion ?? 0} icon={<UsersRound size={17} />} />
          <StatCard label="Criticos" value={String(critical.length)} detail="Alta y critica" tone="orchid" progress={Math.min(critical.length * 25, 100)} />
        </div>

        <section className="mt-5 grid grid-cols-2 gap-3">
          <QuickLink href="/plan" icon={CheckSquare} label="Crear plan del dia" />
          <QuickLink href="/pendientes" icon={ClipboardList} label="Crear pendiente" />
          <QuickLink href="/bitacora" icon={BookOpen} label="Bitacora" />
          <QuickLink href="/horarios" icon={CalendarDays} label="Horarios" />
        </section>

        <Card className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Ranking asesores</h2>
            <Badge>tienda</Badge>
          </div>
          <div className="space-y-3">
            {ranking.map(({ advisor, kpi }) => {
              const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
              return (
              <div key={advisor.id} className="liquid-glass flex items-center justify-between rounded-2xl p-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-volt/12 text-sm font-black text-volt">{advisor.avatar}</span>
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

        <Card className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="text-volt" size={18} />
            <h2 className="text-lg font-black">Comunicados recientes</h2>
          </div>
          {data.announcements.map((item) => (
            <div key={item.id} className="border-t border-line py-3 first:border-t-0 first:pt-0">
              <p className="font-bold">{item.title}</p>
              <p className="mt-1 text-sm text-ink/55">{item.readBy.length} leidos, {advisors.length - item.readBy.length} pendientes</p>
            </div>
          ))}
        </Card>

        <Card className="mt-5">
          <h2 className="mb-3 text-lg font-black">Pendientes de gerencia</h2>
          <div className="space-y-2">
            {critical.map((pending) => (
              <div key={pending.id} className="liquid-glass rounded-xl p-3">
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
