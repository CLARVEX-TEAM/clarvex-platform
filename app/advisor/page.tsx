"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Receipt, ShoppingBag, Target, Trophy } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { completion, money } from "@/lib/format";
import type { User } from "@/lib/types";
import Link from "next/link";
import { AppFrame, Badge, BottomNav, Card, NotificationCard } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DailySalesCard } from "@/components/home/DailySalesCard";
import { QuickKpiGrid, type KpiCardData } from "@/components/home/QuickKpiGrid";
import { QuickActions } from "@/components/home/QuickActions";

const cardAnim = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay }
});

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

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!user || !data) {
    return (
      <>
        <div className="sticky top-0 z-20 h-[68px] border-b border-slate-200/60 bg-white/88 dark:border-slate-800/60 dark:bg-slate-950/95 backdrop-blur-xl" />
        <AppFrame>
          <Card>Conectando con PostgreSQL...</Card>
        </AppFrame>
      </>
    );
  }

  const kpi = data.kpis.find((item) => item.userId === user.id) ?? data.kpis[0];
  const daily = data.dashboardDaily;
  const plan = data.plans.find((item) => item.userId === user.id) ?? data.plans[0];
  const unread = data.announcements.filter((item) => !item.readBy.includes(user.id));
  const salesProgress = completion(daily.dailySales, daily.dailyGoal);
  const planDone = plan?.activities.filter((a) => a.completed).length ?? 0;
  const planTotal = plan?.activities.length ?? 0;

  const kpiCards: KpiCardData[] = [
    {
      label: "VENTAS",
      value: money(daily.dailySales),
      detail: "Tu venta hoy",
      progress: salesProgress,
      icon: ShoppingBag,
      color: "blue"
    },
    {
      label: "TICKETS",
      value: String(daily.transactions),
      detail: "Transacciones",
      icon: Receipt,
      color: "green"
    },
    {
      label: "META",
      value: money(daily.dailyGoal),
      detail: "Objetivo personal",
      icon: Target,
      color: "purple"
    },
    {
      label: "COMISIÓN",
      value: money(kpi?.commissionAmount ?? 0),
      detail: `${kpi?.commissionPercent ?? 0}% est.`,
      icon: Trophy,
      color: "red"
    }
  ];

  return (
    <>
      <HomeHeader
        name={user.name}
        role={user.role}
        photoUrl={user.photoUrl}
        storeName={user.storeName}
        onLogout={handleLogout}
      />
      <AppFrame>
        <DailySalesCard sales={daily.dailySales} goal={daily.dailyGoal} delay={0.08} />

        <div className="mt-3">
          <QuickKpiGrid cards={kpiCards} delay={0.16} />
        </div>

        <motion.div {...cardAnim(0.24)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">Plan del día</h2>
              <Badge>
                {planDone}/{planTotal}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-mint">{plan?.focus ?? "Sin plan asignado"}</p>
            <p className="mt-2 text-sm text-ink/58">
              {plan?.message ?? "Cuando gerencia cree un plan, aparecerá aquí."}
            </p>
            <div className="mt-2">
              <TaskList activities={plan?.activities ?? []} />
            </div>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.32)} className="mt-3">
          <Card>
            <h2 className="mb-3 text-lg font-black">KPIs principales</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Ticket promedio" value={money(kpi?.avgTicket ?? 0)} />
              <Metric label="UPT" value={String(kpi?.upt ?? 0)} />
              <Metric
                label="Conversión"
                value={kpi?.conversion == null ? "Sin tráfico" : `${kpi.conversion}%`}
              />
              <Metric label="Ranking" value={`#${kpi?.ranking ?? 0}`} />
            </div>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.40)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-black">Actividad</h2>
              <Badge tone={unread.length ? "warn" : "success"}>{unread.length} sin leer</Badge>
            </div>
            <div className="space-y-2">
              {unread.slice(0, 2).map((item) => (
                <Link key={item.id} href="/comunicados" className="block">
                  <NotificationCard title={item.title} body={item.body} meta="Comunicado pendiente" unread />
                </Link>
              ))}
              {unread.length === 0 && (
                <div className="border-t border-white/[0.07] py-2 text-[13px] text-muted">
                  Sin comunicados pendientes. Tu actividad está al día.
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        <div className="mt-3">
          <QuickActions variant="advisor" delay={0.48} />
        </div>
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
