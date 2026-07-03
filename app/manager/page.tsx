"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Cake,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Megaphone,
  Receipt,
  ShoppingBag,
  Trophy,
  UsersRound
} from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { completion, money, performanceTone, performanceTextClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { computeDailyStreak } from "@/lib/streaks";
import type { User } from "@/lib/types";
import { AppFrame, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, priorityTone } from "@/components/ui";
import { PullToRefresh } from "@/components/PullToRefresh";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DailySalesCard } from "@/components/home/DailySalesCard";
import { QuickKpiGrid, type KpiCardData } from "@/components/home/QuickKpiGrid";
import { StoreStatusCard } from "@/components/home/StoreStatusCard";
import { QuickActions } from "@/components/home/QuickActions";
import { SalesTrendCard } from "@/components/home/SalesTrendCard";
import { TeamCelebrationsCard } from "@/components/home/TeamCelebrationsCard";
import { buildSalesTrend, buildDailySeries } from "@/lib/trend";
import { upcomingCelebrations } from "@/lib/celebrations";
import { DesktopAutoRedirect } from "@/components/desktop/DesktopAutoRedirect";

const cardAnim = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay }
});

export default function ManagerDashboard() {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null);
  const [manager, setManager] = useState<User | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) router.replace("/login");
      else setManager(session);
    });
  }, [router]);

  const load = useCallback(
    () =>
      fetchAppData()
        .then((d) => { setData(d); setLastUpdated(new Date()); })
        .catch(() => {}),
    []
  );

  useEffect(() => {
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("clarvex-online", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("clarvex-online", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!data) {
    return (
      <>
        <DesktopAutoRedirect />
        <div className="sticky top-0 z-20 h-[68px] border-b border-slate-200/60 bg-white/88 dark:border-slate-800/60 dark:bg-slate-950/95 backdrop-blur-xl" />
        <AppFrame>
          <div className="animate-pulse space-y-3">
            <div className="h-36 rounded-[28px] bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-[28px] bg-slate-200 dark:bg-slate-800" />)}
            </div>
            <div className="h-28 rounded-[28px] bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-[28px] bg-slate-200 dark:bg-slate-800" />)}
            </div>
          </div>
        </AppFrame>
      </>
    );
  }

  const advisors = data.users.filter((u) => u.role === "ASESOR");
  const store = data.dashboardDaily;
  const critical = data.pendings.filter((p) => p.priority === "critica" || p.priority === "alta");
  const doneActivities = data.plans.flatMap((p) => p.activities).filter((a) => a.completed).length;
  const allActivities = data.plans.flatMap((p) => p.activities).length;
  const storeProgress = completion(store?.dailySales ?? 0, store?.dailyGoal ?? 0);
  const activityProgress = allActivities ? Math.round((doneActivities / allActivities) * 100) : 0;
  // Ranking del DÍA: solo el KPI de HOY (no caer al día anterior).
  // Si el asesor no tiene fila de hoy o su meta diaria es 0 → está de descanso:
  // se etiqueta "Descanso" y se manda al fondo en vez de mostrar la venta de ayer.
  const todayKey = data.dashboardDaily.date;
  const ranking = advisors
    .map((a) => {
      const kpi = data.kpis.find((k) => k.userId === a.id && k.date === todayKey);
      const resting = !kpi || (kpi.dailyGoal ?? 0) === 0;
      return { advisor: a, kpi, resting };
    })
    .sort((a, b) =>
      Number(a.resting) - Number(b.resting)
      || completion(b.kpi?.dailySales ?? 0, b.kpi?.dailyGoal ?? 0) - completion(a.kpi?.dailySales ?? 0, a.kpi?.dailyGoal ?? 0)
      || (b.kpi?.dailySales ?? 0) - (a.kpi?.dailySales ?? 0)
    );
  // Podio: top-3 de los que trabajan; el resto (y quienes descansan) van en lista.
  const workingRanking = ranking.filter((r) => !r.resting);
  const top3 = workingRanking.slice(0, 3);
  const restRanking = [...workingRanking.slice(3), ...ranking.filter((r) => r.resting)];
  // Orden visual del podio: 2.º, 1.º, 3.º (el campeón al centro y más alto).
  const podium = (
    [
      top3[1] ? { entry: top3[1], rank: 2, medal: "🥈", ring: "ring-slate-300", bar: "h-16", from: "from-slate-300/40" } : null,
      top3[0] ? { entry: top3[0], rank: 1, medal: "🥇", ring: "ring-yellow-400", bar: "h-24", from: "from-yellow-400/45" } : null,
      top3[2] ? { entry: top3[2], rank: 3, medal: "🥉", ring: "ring-amber-600", bar: "h-12", from: "from-amber-600/40" } : null
    ] as const
  ).filter((slot): slot is NonNullable<typeof slot> => slot !== null);
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Equipo";
  const salesTrend = buildSalesTrend(data.kpis.map((k) => ({ date: k.date, dailySales: k.dailySales, dailyGoal: k.dailyGoal })), todayKey);
  const ventasSeries = buildDailySeries(data.kpis.map((k) => ({ date: k.date, value: k.dailySales })), todayKey, 7);
  const ticketsSeries = buildDailySeries(data.kpis.map((k) => ({ date: k.date, value: k.transactions })), todayKey, 7);
  const celebrations = upcomingCelebrations(
    data.users.map((u) => ({ id: u.id, name: u.name, birthDate: u.birthDate, hireDate: u.hireDate })),
    todayKey
  ).slice(0, 5);

  const kpiCards: KpiCardData[] = [
    {
      label: "VENTAS",
      value: money(store?.dailySales ?? 0),
      detail: "Venta hoy",
      progress: storeProgress,
      trend: ventasSeries,
      icon: ShoppingBag,
      color: "blue"
    },
    {
      label: "TICKETS",
      value: String(store?.transactions ?? 0),
      detail: "Transacciones",
      trend: ticketsSeries,
      icon: Receipt,
      color: "green"
    },
    {
      label: "EQUIPO",
      value: String(advisors.length),
      detail: "Asesores activos",
      icon: UsersRound,
      color: "purple"
    },
    {
      label: "CRÍTICOS",
      value: String(critical.length),
      detail: "Alta y crítica",
      progress: Math.min(critical.length * 25, 100),
      icon: AlertTriangle,
      color: "red"
    }
  ];

  return (
    <>
      <DesktopAutoRedirect />
      <HomeHeader
        name={manager?.name ?? "Gerente"}
        role={manager?.role ?? "GERENTE"}
        photoUrl={manager?.photoUrl}
        storeName={manager?.storeName}
        lastUpdated={lastUpdated}
        onLogout={handleLogout}
      />
      <PullToRefresh onRefresh={load}>
      <AppFrame>
        <DailySalesCard
          sales={store?.dailySales ?? 0}
          goal={store?.dailyGoal ?? 0}
          label="Venta diaria tienda"
          delay={0.08}
        />

        <div className="mt-3">
          <QuickKpiGrid cards={kpiCards} delay={0.16} />
        </div>

        <div className="mt-3">
          <StoreStatusCard
            storeProgress={storeProgress}
            conversion={store?.conversion}
            planProgress={activityProgress}
            delay={0.24}
          />
        </div>

        <motion.div {...cardAnim(0.28)} className="mt-3">
          <SalesTrendCard points={salesTrend} title="Tendencia de tienda" />
        </motion.div>

        <div className="mt-3">
          <QuickActions variant="manager" delay={0.32} />
        </div>

        <motion.div {...cardAnim(0.40)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="text-volt" size={18} />
              <h2 className="text-lg font-black">Desempeño equipo</h2>
            </div>
            <p className="text-sm text-muted">
              {doneActivities} actividades completadas de {allActivities}.
            </p>
            <ProgressBar value={activityProgress} tone="purple" />
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.48)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">Ranking asesores</h2>
              <Badge>tienda</Badge>
            </div>
            {/* Podio top-3 */}
            {podium.length > 0 ? (
              <div className="mb-3 flex items-end justify-center gap-2">
                {podium.map(({ entry, rank, medal, ring, bar, from }) => {
                  const progress = completion(entry.kpi?.dailySales ?? 0, entry.kpi?.dailyGoal ?? 0);
                  return (
                    <div key={entry.advisor.id} className="flex flex-1 flex-col items-center">
                      <span className="text-lg leading-none">{medal}</span>
                      <ProfileAvatar
                        name={entry.advisor.name}
                        photoUrl={entry.advisor.photoUrl}
                        size={rank === 1 ? "md" : "sm"}
                        className={cn("mt-1 ring-2", ring)}
                      />
                      <p className="mt-1 w-full truncate text-center text-[11px] font-black text-ink">{entry.advisor.name.split(" ")[0]}</p>
                      <p className={cn("text-sm font-black", performanceTextClass(progress))}>{progress}%</p>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 * rank }}
                        className={cn("mt-1 grid w-full place-items-center rounded-t-2xl bg-gradient-to-b to-transparent text-xs font-black text-ink/55", bar, from)}
                      >
                        #{rank}
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Resto del equipo */}
            {restRanking.length > 0 ? (
              <div className="divide-y divide-white/[0.07] border-t border-line pt-1">
                {restRanking.map(({ advisor, kpi, resting }, index) => {
                  const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
                  const streak = computeDailyStreak(
                    data.kpis.filter((k) => k.userId === advisor.id && k.date !== undefined).map((k) => ({ date: k.date as string, sales: k.dailySales, goal: k.dailyGoal })),
                    todayKey
                  );
                  return (
                    <div key={advisor.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar name={advisor.name} photoUrl={advisor.photoUrl} size="sm" className={resting ? "opacity-60" : undefined} />
                        <div>
                          <p className="font-bold">
                            {resting ? "" : `#${podium.length + index + 1} `}{advisor.name}
                            {!resting && streak.current >= 2 ? <span className="ml-1.5 text-xs font-black text-orange-500">🔥{streak.current}</span> : null}
                          </p>
                          {resting ? (
                            <p className="text-sm font-semibold text-ink/45">😴 Descanso</p>
                          ) : (
                            <>
                              <p className="text-sm text-ink/50">
                                {money(kpi?.dailySales ?? 0)} de {money(kpi?.dailyGoal ?? 0)}
                              </p>
                              <div className="max-w-40">
                                <ProgressBar value={progress} tone={performanceTone(progress)} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      {resting ? (
                        <Badge>Descanso</Badge>
                      ) : (
                        <p className={cn("text-xl font-black", performanceTextClass(progress))}>{progress}%</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Card>
        </motion.div>

        {celebrations.length > 0 ? (
          <motion.div {...cardAnim(0.54)} className="mt-3">
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Cake className="text-pink-500" size={18} />
                <h2 className="text-lg font-black">Próximos festejos</h2>
              </div>
              <div className="divide-y divide-white/[0.07]">
                {celebrations.map((celebration) => (
                  <div key={`${celebration.id}-${celebration.type}`} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="font-bold">{celebration.type === "cumple" ? "🎂" : "🎉"} {celebration.name}</p>
                      <p className="text-sm text-ink/55">{celebration.type === "cumple" ? "Cumpleaños" : `${celebration.years} ${celebration.years === 1 ? "año" : "años"} en el equipo`}</p>
                    </div>
                    <Badge tone={celebration.daysUntil === 0 ? "warn" : "default"}>{celebration.daysUntil === 0 ? "¡Hoy!" : `en ${celebration.daysUntil} ${celebration.daysUntil === 1 ? "día" : "días"}`}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        ) : null}

        <motion.div {...cardAnim(0.55)} className="mt-3">
          <TeamCelebrationsCard
            members={data.users.map((u) => ({ id: u.id, name: u.name, photoUrl: u.photoUrl, birthDate: u.birthDate, hireDate: u.hireDate }))}
            manageHref="/equipo"
          />
        </motion.div>

        <motion.div {...cardAnim(0.56)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="text-volt" size={18} />
                <h2 className="text-lg font-black">Comunicados recientes</h2>
              </div>
              <Link href="/comunicados" className="text-xs font-black text-volt">Ver todos</Link>
            </div>
            {data.announcements.map((item) => (
              <div key={item.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <p className="font-bold">{item.title}</p>
                <p className="mt-1 text-sm text-ink/55">
                  {item.readBy.length} leídos, {advisors.length - item.readBy.length} pendientes
                </p>
              </div>
            ))}
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.64)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">Pendientes de gerencia</h2>
              <Link href="/pendientes" className="text-xs font-black text-volt">Ver todos</Link>
            </div>
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
        </motion.div>

        <motion.div {...cardAnim(0.72)} className="mt-3">
          <Card className="p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 dark:bg-[#10301f] text-emerald-600">
                <ClipboardCheck size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-black tracking-[-0.02em] text-ink">Checklist de tienda</h2>
                <p className="mt-0.5 text-xs text-muted">Apertura y cierre con evidencia</p>
              </div>
              <Link
                href="/checklist"
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-volt px-3.5 text-xs font-black text-white transition active:scale-95"
              >
                Abrir <ArrowRight size={14} />
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.80)} className="mt-3">
          <Card className="p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 dark:bg-[#1a2540] text-volt">
                <Database size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-black tracking-[-0.02em] text-ink">Centro de Datos</h2>
                <p className="mt-0.5 text-xs text-muted">Fuentes y sincronizaciones</p>
              </div>
              <Link
                href="/datos"
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-volt px-3.5 text-xs font-black text-white transition active:scale-95"
              >
                Abrir <ArrowRight size={14} />
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.84)} className="mt-3">
          <Card className="p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-green-50 dark:bg-[#10301f] text-green-600">
                <Trophy size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-black tracking-[-0.02em] text-ink">Selección Mexicana 🇲🇽</h2>
                <p className="mt-0.5 text-xs text-muted">Programa partidos y avisa los goles</p>
              </div>
              <Link
                href="/partido"
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-green-600 px-3.5 text-xs font-black text-white transition active:scale-95"
              >
                Abrir <ArrowRight size={14} />
              </Link>
            </div>
          </Card>
        </motion.div>

        {manager?.platformAdmin ? (
          <motion.div {...cardAnim(0.88)} className="mt-3">
            <Card className="p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-50 dark:bg-[#2a1f40] text-violet-600">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-black tracking-[-0.02em] text-ink">Administración</h2>
                  <p className="mt-0.5 text-xs text-muted">Tiendas de la plataforma</p>
                </div>
                <Link
                  href="/admin"
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-violet-600 px-3.5 text-xs font-black text-white transition active:scale-95"
                >
                  Abrir <ArrowRight size={14} />
                </Link>
              </div>
            </Card>
          </motion.div>
        ) : null}
      </AppFrame>
      </PullToRefresh>
      <BottomNav />
    </>
  );
}
