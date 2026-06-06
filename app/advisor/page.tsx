"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Receipt, ShoppingBag, Sparkles, Target, Trophy } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { completion, money } from "@/lib/format";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, NotificationCard, ProgressBar, ProgressRing, StatCard } from "@/components/ui";
import { TaskList } from "@/components/TaskList";

export default function AdvisorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) router.replace("/login");
      else setUser(session);
    });
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
        <Card className="premium-hero mb-3 rounded-[28px] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Meta diaria</p>
              <h2 className="mt-1 text-[2.25rem] font-black leading-none tracking-[-0.045em] text-ink">{salesProgress}%</h2>
              <p className="mt-1 text-xs text-ink/58">{money(kpi?.dailySales ?? 0)} de {money(kpi?.dailyGoal ?? 0)}</p>
            </div>
            <ProgressRing value={salesProgress} tone={salesProgress >= 80 ? "volt" : "ember"} size={68} />
          </div>
          <ProgressBar value={salesProgress} />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <StatCard compact label="Meta" value={money(kpi?.dailyGoal ?? 0)} detail="Objetivo personal" progress={100} icon={<Target size={15} />} />
          <StatCard compact label="Venta" value={money(kpi?.dailySales ?? 0)} detail={`${salesProgress}% cumplimiento`} tone="mint" progress={salesProgress} icon={<ShoppingBag size={15} />} />
          <StatCard compact label="Tickets" value={String(kpi?.transactions ?? 0)} detail="Transacciones" tone="sky" icon={<Receipt size={15} />} />
          <StatCard compact label="Comision" value={money(kpi?.commissionAmount ?? 0)} detail={`${kpi?.commissionPercent ?? 0}% estimado`} tone="purple" icon={<Trophy size={15} />} />
        </div>

        <Card className="mt-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-black">Plan del dia</h2>
            <Badge>{planDone}/{planTotal}</Badge>
          </div>
          <p className="text-sm font-semibold text-mint">{plan?.focus ?? "Sin plan asignado"}</p>
          <p className="mt-2 text-sm text-ink/58">{plan?.message ?? "Cuando gerencia cree un plan, aparecera aqui."}</p>
          <div className="mt-2">
            <TaskList activities={plan?.activities ?? []} />
          </div>
        </Card>

        <Card className="mt-3">
          <h2 className="mb-3 text-lg font-black">KPIs principales</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Ticket promedio" value={money(kpi?.avgTicket ?? 0)} />
            <Metric label="UPT" value={String(kpi?.upt ?? 0)} />
            <Metric label="Conversion" value={`${kpi?.conversion ?? 0}%`} />
            <Metric label="Ranking" value={`#${kpi?.ranking ?? 0}`} />
          </div>
        </Card>

        <Card className="mt-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="text-sky" size={18} />
              <h2 className="text-lg font-black">Actividad</h2>
            </div>
            <Badge tone={unread.length ? "warn" : "success"}>{unread.length} sin leer</Badge>
          </div>
          <div className="space-y-2">
            {unread.slice(0, 2).map((item) => (
              <NotificationCard
                key={item.id}
                title={item.title}
                body={item.body}
                meta="Comunicado pendiente"
                unread
              />
            ))}
            {unread.length === 0 ? (
              <div className="border-t border-white/[0.07] py-2 text-[13px] text-muted">
                Sin comunicados pendientes. Tu actividad esta al dia.
              </div>
            ) : null}
          </div>
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/[0.07] px-1 py-2 last:border-b-0">
      <p className="text-ink/45">{label}</p>
      <p className="mt-1 text-lg font-black text-ink/90">{value}</p>
    </div>
  );
}
