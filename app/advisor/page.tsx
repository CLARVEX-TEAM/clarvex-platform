"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Receipt, ShoppingBag, Target } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { completion, money } from "@/lib/format";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProgressBar, ProgressRing, StatCard } from "@/components/ui";
import { TaskList } from "@/components/TaskList";

export default function AdvisorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setUser(session);
    fetchAppData().then(setData).catch(() => setData(null));
  }, [router]);

  if (!user || !data) {
    return (
      <>
        <AppHeader title="Cargando" subtitle="Preparando tu panel de tienda." />
        <AppFrame>
          <Card>Conectando con PostgreSQL...</Card>
        </AppFrame>
      </>
    );
  }

  const kpi = data.kpis.find((item) => item.userId === user.id) ?? data.kpis[0];
  const plan = data.plans.find((item) => item.userId === user.id) ?? data.plans[0];
  const todayShift = data.schedules.find((item) => item.userId === user.id && item.day === "Vie");
  const unread = data.announcements.filter((item) => !item.readBy.includes(user.id));
  const salesProgress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
  const planDone = plan?.activities.filter((activity) => activity.completed).length ?? 0;
  const planTotal = plan?.activities.length ?? 0;

  return (
    <>
      <AppHeader
        title={`Hola, ${user.name}`}
        subtitle="Tu foco, horario y avance del dia."
        avatar={user.avatar}
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
        <Card className="mb-4 border-volt/25 bg-volt/[0.045]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">Meta diaria</p>
              <h2 className="mt-2 text-4xl font-black tracking-tight text-ink">{salesProgress}%</h2>
              <p className="mt-1 text-sm text-ink/58">{money(kpi?.dailySales ?? 0)} de {money(kpi?.dailyGoal ?? 0)}</p>
            </div>
            <ProgressRing value={salesProgress} tone={salesProgress >= 80 ? "volt" : "ember"} />
          </div>
          <ProgressBar value={salesProgress} />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Meta" value={money(kpi?.dailyGoal ?? 0)} detail="Objetivo personal" progress={100} icon={<Target size={17} />} />
          <StatCard label="Venta" value={money(kpi?.dailySales ?? 0)} detail={`${salesProgress}% cumplimiento`} tone="mint" progress={salesProgress} icon={<ShoppingBag size={17} />} />
          <StatCard label="Tickets" value={String(kpi?.transactions ?? 0)} detail="Transacciones" tone="ember" icon={<Receipt size={17} />} />
          <StatCard label="Avisos" value={String(unread.length)} detail="Pendientes de leer" tone="orchid" progress={unread.length ? 50 : 100} icon={<Bell size={17} />} />
        </div>

        <Card className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-black">Plan del dia</h2>
            <Badge>{planDone}/{planTotal}</Badge>
          </div>
          <p className="text-sm font-semibold text-mint">{plan?.focus ?? "Sin plan asignado"}</p>
          <p className="mt-2 text-sm text-ink/58">{plan?.message ?? "Cuando gerencia cree un plan, aparecera aqui."}</p>
          <div className="mt-4">
            <TaskList activities={plan?.activities ?? []} />
          </div>
        </Card>

        <Card className="mt-5">
          <h2 className="mb-3 text-lg font-black">KPIs principales</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Ticket promedio" value={money(kpi?.avgTicket ?? 0)} />
            <Metric label="UPT" value={String(kpi?.upt ?? 0)} />
            <Metric label="Conversion" value={`${kpi?.conversion ?? 0}%`} />
            <Metric label="Ranking" value={`#${kpi?.ranking ?? 0}`} />
          </div>
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="liquid-glass rounded-2xl p-3">
      <p className="text-ink/45">{label}</p>
      <p className="mt-1 text-lg font-black text-ink/90">{value}</p>
    </div>
  );
}
