"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Receipt, ShoppingBag, Target, Trophy, Sparkles } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { clearLoginBounces, noteLoginBounce } from "@/lib/session-loop";
import { accruedCommission } from "@/lib/commission";
import { completion, money } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { computeDailyStreak } from "@/lib/streaks";
import { computeAchievements } from "@/lib/achievements";
import { buildSalesTrend, buildDailySeries } from "@/lib/trend";
import type { User } from "@/lib/types";
import { AppFrame, Badge, Card, NotificationCard, SimulatorCard } from "@/components/ui";
import { TaskList } from "@/components/TaskList";
import { Confetti } from "@/components/Confetti";
import { PullToRefresh } from "@/components/PullToRefresh";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DailySalesCard } from "@/components/home/DailySalesCard";
import { QuickKpiGrid, type KpiCardData } from "@/components/home/QuickKpiGrid";
import { QuickActions } from "@/components/home/QuickActions";
import { UniformToday } from "@/components/home/UniformToday";
import { SalesTrendCard } from "@/components/home/SalesTrendCard";
import { TeamCelebrationsCard } from "@/components/home/TeamCelebrationsCard";
import { PaceCard } from "@/components/home/PaceCard";
import { AchievementsCard } from "@/components/home/AchievementsCard";
import { QuincenaCard } from "@/components/home/QuincenaCard";
import { useAppData } from "@/lib/use-app-data";
import { BlurFade } from "@/components/magic/BlurFade";
import { ShineBorder } from "@/components/magic/ShineBorder";
import { debeIrAMiDia } from "@/lib/portada";
import { enContenedorNativo } from "@/lib/puente-nativo";

const cardAnim = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay }
});

export default function AdvisorDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  // El fetch de sesion no pudo ni preguntar (red). Distinto de «no hay sesion».
  const [sessionFailed, setSessionFailed] = useState(false);
  const { data, lastUpdated, loadFailed, setLoadFailed, load } = useAppData();
  const [tips, setTips] = useState<{ title: string; description: string }[]>([]);
  const [profile, setProfile] = useState<any | null>(null);
  const [loadingTips, setLoadingTips] = useState(false);
  const [tipsError, setTipsError] = useState("");

  async function fetchSalesTips() {
    if (!data) return;
    setLoadingTips(true);
    setTipsError("");
    try {
      const res = await fetch("/api/ai/coach-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.dashboardDaily.date })
      });
      const payload = await res.json() as any;
      if (!res.ok) throw new Error(payload.error || "No se pudo obtener consejos.");
      setTips(payload.tips || []);
      setProfile(payload);
    } catch (err: any) {
      setTipsError(err.message || "Error al obtener sugerencias.");
    } finally {
      setLoadingTips(false);
    }
  }

  /*
   * `getSession` reintenta por dentro y LANZA si no logró preguntar. Atraparlo
   * es obligatorio: sin `.catch` la promesa quedaba sin atender, `user` se
   * quedaba en null y la pantalla se congelaba en esqueletos, porque su rama de
   * error exigía tener usuario. Ahora el fallo se marca y se puede reintentar.
   */
  const loadSession = useCallback(() => {
    setSessionFailed(false);
    return getSession()
      .then((session) => {
        if (!session) {
          noteLoginBounce("advisor");
          router.replace("/login");
        } else if (debeIrAMiDia(session, enContenedorNativo())) {
          /*
           * ⚠️ La guarda va en el DESTINO, no solo en quien navega. Esta pantalla
           * es la portada de la WEB: dentro de la APK no se debe ver nunca, y se
           * llega por más de veinte sitios. Arreglar los orígenes uno a uno ya
           * dejó fuera el login y el fallo se reportó dos veces el mismo día.
           */
          router.replace("/mi-dia");
        } else {
          clearLoginBounces();
          setUser(session);
        }
      })
      .catch(() => setSessionFailed(true));
  }, [router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

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

  /*
   * ⚠️ Esta rama NO puede exigir `user`.
   *
   * Antes decía `user && !data && loadFailed`, así que el caso más común —no se
   * pudo resolver la sesión— caía al esqueleto de abajo y ahí se quedaba: sin
   * mensaje, sin botón, para siempre. La pantalla de error tiene que poder
   * aparecer justamente cuando falta el usuario.
   */
  if ((!user && sessionFailed) || (!data && loadFailed)) {
    return (
      <div className="grid min-h-screen place-items-center px-8 text-center">
        <div>
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-3xl bg-rose-500/10 text-2xl">📡</span>
          <p className="text-base font-semibold text-ink">No se pudo cargar la información</p>
          <p className="mt-1 text-sm font-semibold text-muted">Revisa tu conexión e intenta de nuevo.</p>
          <button
            type="button"
            onClick={() => {
              setLoadFailed(false);
              void loadSession();
              void load();
            }}
            className="mt-4 rounded-full bg-volt px-7 py-2.5 text-sm font-semibold text-white transition active:scale-95"
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

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalHistoricalSales = data.kpis.filter((k) => k.userId === user.id).reduce((sum, k) => sum + Number(k.dailySales), 0);
  const xp = (unlockedCount * 100) + Math.floor(totalHistoricalSales / 100) + (planDone * 50);
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const nextLevelXp = Math.pow(level, 2) * 100;
  const currentLevelMinXp = Math.pow(level - 1, 2) * 100;
  const xpProgress = Math.round(((xp - currentLevelMinXp) / (nextLevelXp - currentLevelMinXp)) * 100);

  // Comisión ACUMULADA del mes, calculada en vivo (venta mes × tasa del bracket)
  // porque el RDV a veces trae commissionAmount en 0. Solo lee el cálculo aprobado.
  const myCommission = accruedCommission({
    sales: kpi?.monthlySales ?? 0,
    goal: kpi?.monthlyGoal ?? 0,
    minimum: kpi?.commissionMinimum,
    rules: data.commissionRules,
    role: user.role,
    basis: data.commissionBasis
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
      value: money(myCommission.amount),
      detail: `${myCommission.percent}% · ${completion(kpi?.monthlySales ?? 0, kpi?.monthlyGoal ?? 0)}% alcance`,
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
        {/* ShineBorder aquí y no BorderBeam: esto está SIN ATENDER, y este
            efecto insiste. El haz marca importancia; el brillo del contorno
            pide acción. Desaparece solo cuando ya no hay comunicados sin leer. */}
        {unread.length > 0 && (
          <ShineBorder className="mb-3" tone="ember">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-3d flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3.5"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EEF3FF] text-base dark:bg-[#172134]">📢</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">Comunicados pendientes</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Tienes {unread.length} {unread.length === 1 ? "comunicado" : "comunicados"} sin confirmar lectura.
                </p>
              </div>
            </div>
          </motion.div>
          </ShineBorder>
        )}

        {/* `beam` solo aquí: es la tarjeta principal de la pantalla. Si lo lleva
            más de una, ninguna destaca y el efecto pierde su función. */}
        <DailySalesCard sales={daily.dailySales} goal={daily.dailyGoal} delay={0.08} beam />

        {/* Gamificación (Nivel, XP y Retos).
            BlurFade SUSTITUYE aquí a cardAnim, no se suma: dos entradas sobre
            el mismo bloque se pisan. Solo en este y en el siguiente; el resto
            de tarjetas mantiene cardAnim porque BlurFade anima `filter`, caro
            en GPU, y hay más de diez en esta pantalla. */}
        <BlurFade delay={0.1} className="mt-3">
          <Card className="border border-white/10 bg-[#0A0A0A]/60 backdrop-blur-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 text-white font-semibold text-lg shadow-lg shadow-amber-500/10">
                  {level}
                </span>
                <div>
                  <p className="text-xs font-bold text-white">Nivel actual</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Siguiente nivel en {nextLevelXp - xp} XP</p>
                </div>
              </div>
              <Badge tone="success">{xp} XP Totales</Badge>
            </div>
            
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-semibold">
                <span>Progreso de Nivel</span>
                <span>{xpProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpProgress}%` }}
                  className="h-full bg-gradient-to-r from-[#2563EB] to-emerald-400"
                />
              </div>
            </div>

            {/* Retos y Tareas Diarias */}
            <div className="mt-4 pt-3.5 border-t border-white/5 space-y-2">
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <span>⚡</span> Retos del Día:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className={`rounded-xl border p-2 flex flex-col justify-between ${daily.dailySales >= daily.dailyGoal && daily.dailyGoal > 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/5"}`}>
                  <p className="font-bold text-white">Meta Diaria</p>
                  <p className="text-slate-400 mt-0.5">Vender {money(daily.dailyGoal)}</p>
                  <span className={`mt-1.5 font-bold uppercase tracking-wider text-[9px] ${daily.dailySales >= daily.dailyGoal && daily.dailyGoal > 0 ? "text-[#2563EB]" : "text-amber-500"}`}>
                    {daily.dailySales >= daily.dailyGoal && daily.dailyGoal > 0 ? "Completado" : "Pendiente"}
                  </span>
                </div>
                <div className={`rounded-xl border p-2 flex flex-col justify-between ${planTotal > 0 && planDone === planTotal ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/5"}`}>
                  <p className="font-bold text-white">Checklist</p>
                  <p className="text-slate-400 mt-0.5">Plan ({planDone}/{planTotal})</p>
                  <span className={`mt-1.5 font-bold uppercase tracking-wider text-[9px] ${planTotal > 0 && planDone === planTotal ? "text-[#2563EB]" : "text-amber-500"}`}>
                    {planTotal > 0 && planDone === planTotal ? "Completado" : "Pendiente"}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </BlurFade>

        <motion.div {...cardAnim(0.12)} className="mt-3">
          <PaceCard sales={daily.dailySales} goal={daily.dailyGoal} userId={user.id} />
        </motion.div>

        <motion.div {...cardAnim(0.13)} className="mt-3">
          <QuincenaCard userId={user.id} />
        </motion.div>

        <div className="mt-3">
          <QuickKpiGrid cards={kpiCards} delay={0.16} />
        </div>

        <div className="mt-3">
          <QuickActions variant="advisor" delay={0.24} />
          <UniformToday />
        </div>

        <motion.div {...cardAnim(0.26)} className="mt-3">
          {/* Cifras MENSUALES: la comisión se paga por mes y el alcance se mide
              contra el mínimo del mes. Con la venta del día contra ese mínimo el
              alcance sale falso y la tasa se queda clavada en el bracket más bajo. */}
          <SimulatorCard
            sales={kpi?.monthlySales ?? 0}
            goal={kpi?.monthlyGoal ?? 0}
            minimum={kpi?.commissionMinimum}
            rules={data.commissionRules}
            role={user.role}
          />
        </motion.div>

        <motion.div {...cardAnim(0.28)} className="mt-3">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Tu racha</p>
                <h2 className="mt-1 text-[2rem] font-semibold leading-none text-ink">🔥 {streak.current} {streak.current === 1 ? "día" : "días"}</h2>
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

        <motion.div {...cardAnim(0.31)} className="mt-3">
          <Card>
            <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
              <span className="text-[#2563EB]">🎯</span> Retos del Día
            </h2>
            <div className="space-y-3.5">
              {/* Reto 1: Meta de Ventas */}
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-bold text-ink">Objetivo de Venta</p>
                  <p className="text-xs text-muted mt-0.5">Alcanzar tu meta personal de {money(daily.dailyGoal)}</p>
                </div>
                <Badge tone={daily.dailySales >= daily.dailyGoal && daily.dailyGoal > 0 ? "success" : "warn"}>
                  {daily.dailySales >= daily.dailyGoal && daily.dailyGoal > 0 ? "Completado" : "Pendiente"}
                </Badge>
              </div>

              {/* Reto 2: Checklist */}
              <div className="flex items-center justify-between gap-4 text-sm border-t border-line pt-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">Checklist Operativo</p>
                  <p className="text-xs text-muted mt-0.5">Completar todas las tareas del plan de hoy ({planDone}/{planTotal})</p>
                </div>
                <Badge tone={planTotal > 0 && planDone === planTotal ? "success" : "warn"}>
                  {planTotal > 0 && planDone === planTotal ? "Completado" : "Pendiente"}
                </Badge>
              </div>

              {/* Reto 3: UPT */}
              <div className="flex items-center justify-between gap-4 text-sm border-t border-line pt-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">UPT Imparable</p>
                  <p className="text-xs text-muted mt-0.5">Mantener tu ratio de artículos por ticket arriba de 2.0 (UPT actual: {kpi?.upt ?? 0})</p>
                </div>
                <Badge tone={(kpi?.upt ?? 0) >= 2.0 ? "success" : "warn"}>
                  {(kpi?.upt ?? 0) >= 2.0 ? "Completado" : "Bajo"}
                </Badge>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.32)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Plan del día</h2>
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

        <motion.div {...cardAnim(0.34)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="text-volt animate-pulse" size={18} />
                <h2 className="text-lg font-semibold">Coach de Ventas IA</h2>
              </div>
              <Badge tone="success">Recomendaciones</Badge>
            </div>
            
            {tips.length === 0 ? (
              <div className="py-2">
                <p className="text-xs text-muted mb-3">Obtén recomendaciones personalizadas basadas en tus métricas actuales para elevar tus ventas.</p>
                <button
                  type="button"
                  onClick={() => void fetchSalesTips()}
                  disabled={loadingTips}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
                >
                  <Sparkles size={16} />
                  {loadingTips ? "Analizando KPIs..." : "Consultar a mi Coach IA"}
                </button>
                {tipsError && <p className="mt-2 text-xs text-rose-500 font-semibold">{tipsError}</p>}
              </div>
            ) : (
              <div className="space-y-4">
                {profile && profile.operationalRisk && (
                  <div className="rounded-xl bg-panel border border-line p-3 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted font-bold">Riesgo Operacional</p>
                      <p className="text-xs text-ink mt-0.5 leading-relaxed truncate">{profile.operationalRisk.reason}</p>
                    </div>
                    <Badge tone={
                      profile.operationalRisk.level === "Bajo" ? "success" :
                      profile.operationalRisk.level === "Medio" ? "warn" : "danger"
                    }>
                      {profile.operationalRisk.level}
                    </Badge>
                  </div>
                )}

                {profile && profile.strongestKpi && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5">
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 text-[10px] uppercase tracking-wider">Fuerte 🚀</p>
                      <p className="font-semibold text-ink mt-1 text-[13px]">{profile.strongestKpi.name}</p>
                      <p className="text-muted mt-0.5 leading-relaxed text-[11px]">{profile.strongestKpi.details}</p>
                    </div>
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2.5">
                      <p className="font-bold text-rose-600 dark:text-rose-400 text-[10px] uppercase tracking-wider">Mejora 🎯</p>
                      <p className="font-semibold text-ink mt-1 text-[13px]">{profile.weakestKpi.name}</p>
                      <p className="text-muted mt-0.5 leading-relaxed text-[11px]">{profile.weakestKpi.details}</p>
                    </div>
                  </div>
                )}

                {profile && profile.techniques && (
                  <div className="rounded-xl bg-panel border border-line p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1">
                      💡 Técnicas de Venta Recomendadas:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-ink leading-relaxed">
                      {profile.techniques.map((t: string, idx: number) => (
                        <li key={idx}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {profile && profile.recommendedResources && profile.recommendedResources.length > 0 && (
                  <div className="rounded-xl bg-panel border border-line p-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-volt flex items-center gap-1">
                      📚 Capacitación Recomendada:
                    </p>
                    <div className="space-y-2">
                      {profile.recommendedResources.map((res: any) => (
                        <div
                          key={res.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-panel border border-line p-2"
                        >
                          <span className="text-xs text-ink font-semibold truncate">{res.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  {tips.map((tip, idx) => (
                    <div key={idx} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="text-sm font-bold text-volt">{tip.title}</p>
                      <p className="mt-1 text-xs text-muted">{tip.description}</p>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void fetchSalesTips()}
                  disabled={loadingTips}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-bold text-muted hover:text-ink transition"
                >
                  <Sparkles size={12} />
                  {loadingTips ? "Actualizando..." : "Actualizar consejos"}
                </button>
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.36)} className="mt-3">
          <SalesTrendCard points={salesTrend} title="Tu tendencia" />
        </motion.div>

        <motion.div {...cardAnim(0.40)} className="mt-3">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">KPIs principales</h2>
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
              <h2 className="text-lg font-semibold">Actividad</h2>
              <Badge tone={unread.length ? "warn" : "success"}>{unread.length} sin leer</Badge>
            </div>
            <div className="space-y-2">
              {unread.slice(0, 2).map((item) => (
                <NotificationCard key={item.id} title={item.title} body={item.body} meta="Comunicado pendiente" unread />
              ))}
              {unread.length === 0 && (
                <div className="border-t border-line py-2 text-[13px] text-muted">
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
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line px-1 py-2 last:border-b-0">
      <p className="text-ink/45">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink/90">{value}</p>
    </div>
  );
}
