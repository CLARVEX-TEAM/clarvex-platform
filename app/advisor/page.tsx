"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Receipt, ShoppingBag, Target, Trophy } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { completion, money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { computeDailyStreak } from "@/lib/streaks";
import { computeAchievements } from "@/lib/achievements";
import { buildSalesTrend, buildDailySeries } from "@/lib/trend";
import type { User } from "@/lib/types";
import Link from "next/link";
import { AppFrame, Badge, BottomNav, Card, NotificationCard } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { Confetti } from "@/components/Confetti";
import { PullToRefresh } from "@/components/PullToRefresh";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DailySalesCard } from "@/components/home/DailySalesCard";
import { QuickKpiGrid, type KpiCardData } from "@/components/home/QuickKpiGrid";
import { QuickActions } from "@/components/home/QuickActions";
import { SalesTrendCard } from "@/components/home/SalesTrendCard";
import { TeamCelebrationsCard } from "@/components/home/TeamCelebrationsCard";
import { PaceCard } from "@/components/home/PaceCard";
import { AchievementsCard } from "@/components/home/AchievementsCard";
import { useAppData } from "@/lib/use-app-data";

const cardAnim = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay }
});

export default function AdvisorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const { data, lastUpdated, loadFailed, setLoadFailed, load } = useAppData();

  useEffect(() => {
    getSession().then((session) => {
      if (!session) router.replace("/login");
      else setUser(session);
    });
  }, [router]);

  // Confetti al alcanzar la meta del día (una sola vez por día/sesión).
  useEffect(() => {
    if (!data || !user) return;
    const goalReached = data.dashboardDaily.dailyGoal > 0 && data.dashboardDaily.dailySales >= data.dashboardDaily.dailyGoal;
    if (!goalReached) return;
    const key = `clarvex-celebrate-${user.id}-${data.dashboardDaily.date}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* sin sessionStorage */ }
    setCelebrate(true);
    haptic([20, 40, 20]);
    const id = setTimeout(() => setCelebrate(false), 2600);
    return () => clearTimeout(id);
  }, [data, user]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (user && !data && loadFailed) {
    return (
      <div className="grid min-h-screen place-items-center px-8 text-center">
        <div>
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-3xl bg-rose-500/10 text-2xl">📡</span>
          <p className="text-base font-black text-ink">No se pudo cargar la información</p>
          <p className="mt-1 text-sm font-semibold text-muted">Revisa tu conexión e intenta de nuevo.</p>
          <button
            type="button"
            onClick={() => { setLoadFailed(false); void load(); }}
            className="mt-4 rounded-full bg-volt px-7 py-2.5 text-sm font-black text-white transition active:scale-95"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!user || !data) {
    return (
      <>
        <div className="sticky top-[var(--matchday-offset,0px)] z-20 h-[68px] border-b border-slate-200/60 bg-white/88 dark:border-slate-800/60 dark:bg-slate-950/95 backdrop-blur-xl" />
        <AppFrame>
          <div className="animate-pulse space-y-3">
            <div className="h-36 rounded-[28px] bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-[28px] bg-slate-200 dark:bg-slate-800" />)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-[28px] bg-slate-200 dark:bg-slate-800" />)}
            </div>
            <div className="h-28 rounded-[28px] bg-slate-200 dark:bg-slate-800" />
          </div>
        </AppFrame>
      </>
    );
  }

  // KPI más reciente HASTA HOY (no un día futuro que el RDV precarga con venta $0).
  const todayKey = data.dashboardDaily.date;
  const kpi = data.kpis.find((item) => item.userId === user.id && item.date !== undefined && item.date <= todayKey)
    ?? data.kpis.find((item) => item.userId === user.id)
    ?? data.kpis[0];
  const daily = data.dashboardDaily;
  const plan = data.plans.find((item) => item.userId === user.id) ?? data.plans[0];
  const unread = data.announcements.filter((item) => !item.readBy.includes(user.id));
  const salesProgress = completion(daily.dailySales, daily.dailyGoal);
  const planDone = plan?.activities.filter((a) => a.completed).length ?? 0;
  const planTotal = plan?.activities.length ?? 0;

  const streak = computeDailyStreak(
    data.kpis.filter((k) => k.date !== undefined).map((k) => ({ date: k.date as string, sales: k.dailySales, goal: k.dailyGoal })),
    todayKey
  );
  const badges: string[] = [];
  if (daily.dailyGoal > 0 && daily.dailySales >= daily.dailyGoal) badges.push("🎯 Meta de hoy");
  if ((kpi?.monthlyGoal ?? 0) > 0 && (kpi?.monthlySales ?? 0) >= (kpi?.monthlyGoal ?? 0)) badges.push("💯 Mes cumplido");
  if (streak.best >= 7) badges.push("⚡ Imparable");
  const achievements = computeAchievements({
    userKpis: data.kpis.filter((k) => k.userId === user.id),
    todayKey,
    streakBest: streak.best
  });
  const salesTrend = buildSalesTrend(data.kpis.map((k) => ({ date: k.date, dailySales: k.dailySales, dailyGoal: k.dailyGoal })), todayKey);
  const ventasSeries = buildDailySeries(data.kpis.map((k) => ({ date: k.date, value: k.dailySales })), todayKey, 7);
  const ticketsSeries = buildDailySeries(data.kpis.map((k) => ({ date: k.date, value: k.transactions })), todayKey, 7);

  const kpiCards: KpiCardData[] = [
    {
      label: "VENTAS",
      value: money(daily.dailySales),
      detail: "Tu venta hoy",
      progress: salesProgress,
      trend: ventasSeries,
      icon: ShoppingBag,
      color: "blue"
    },
    {
      label: "TICKETS",
      value: String(daily.transactions),
      detail: "Transacciones",
      trend: ticketsSeries,
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
        lastUpdated={lastUpdated}
        onLogout={handleLogout}
      />
      <Confetti show={celebrate} />
      <PullToRefresh onRefresh={load}>
      <AppFrame>
        <DailySalesCard sales={daily.dailySales} goal={daily.dailyGoal} delay={0.08} />

        <motion.div {...cardAnim(0.12)} className="mt-3">
          <PaceCard sales={daily.dailySales} goal={daily.dailyGoal} userId={user.id} />
        </motion.div>

        <div className="mt-3">
          <QuickKpiGrid cards={kpiCards} delay={0.16} />
        </div>

        <div className="mt-3">
          <QuickActions variant="advisor" delay={0.24} />
        </div>

        <motion.div {...cardAnim(0.28)} className="mt-3">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Tu racha</p>
                <h2 className="mt-1 text-[2rem] font-black leading-none text-ink">🔥 {streak.current} {streak.current === 1 ? "día" : "días"}</h2>
                <p className="mt-1 text-xs text-muted">Mejor racha: {streak.best} {streak.best === 1 ? "día" : "días"} cumpliendo meta</p>
              </div>
            </div>
            {badges.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {badges.map((badge) => <Badge key={badge} tone="success">{badge}</Badge>)}
              </div>
            ) : null}
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.30)} className="mt-3">
          <AchievementsCard achievements={achievements} />
        </motion.div>

        <motion.div {...cardAnim(0.32)} className="mt-3">
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

        <motion.div {...cardAnim(0.36)} className="mt-3">
          <SalesTrendCard points={salesTrend} title="Tu tendencia" />
        </motion.div>

        <motion.div {...cardAnim(0.40)} className="mt-3">
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

        <motion.div {...cardAnim(0.48)} className="mt-3">
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

        <motion.div {...cardAnim(0.56)} className="mt-3">
          <TeamCelebrationsCard members={data.users.map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl, birthDate: u.birthDate, hireDate: u.hireDate }))} />
        </motion.div>
      </AppFrame>
      </PullToRefresh>
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
