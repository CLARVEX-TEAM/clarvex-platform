"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { completion, money, performanceTextClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import { computeDailyStreak } from "@/lib/streaks";
import { isRestingToday, restLabel, scheduleStatusByUser } from "@/lib/working-today";
import type { User } from "@/lib/types";
import { AppFrame, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, priorityTone } from "@/components/ui";
import { PullToRefresh } from "@/components/PullToRefresh";
import { HomeHeader } from "@/components/home/HomeHeader";
import { DailySalesCard } from "@/components/home/DailySalesCard";
import { QuickKpiGrid, type KpiCardData } from "@/components/home/QuickKpiGrid";
import { StoreStatusCard } from "@/components/home/StoreStatusCard";
import { QuickActions } from "@/components/home/QuickActions";
import { UniformToday } from "@/components/home/UniformToday";
import { SalesTrendCard } from "@/components/home/SalesTrendCard";
import { TeamCelebrationsCard } from "@/components/home/TeamCelebrationsCard";
import { QuincenaCard } from "@/components/home/QuincenaCard";
import { buildSalesTrend, buildDailySeries } from "@/lib/trend";
import { upcomingCelebrations } from "@/lib/celebrations";
import { DesktopAutoRedirect } from "@/components/desktop/DesktopAutoRedirect";
import { DesktopSwitchLink } from "@/components/desktop/DesktopSwitchLink";
import { useAppData } from "@/lib/use-app-data";

const cardAnim = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay }
});

export default function ManagerDashboard() {
  const router = useRouter();
  const [manager, setManager] = useState<User | null>(null);
  const { data, lastUpdated, loadFailed, setLoadFailed, load } = useAppData();

  useEffect(() => {
    getSession()
      .then((session) => {
        if (!session) router.replace("/login");
        else setManager(session);
      })
      .catch(() => {}); // un fallo de red no debe tumbar la pantalla; el reintento de fetchAppData recupera
  }, [router]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!data && loadFailed) {
    return (
      <>
        <div className="grid min-h-screen place-items-center px-8 text-center">
          <div>
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-3xl bg-rose-500/10 text-2xl">📡</span>
            <p className="text-base font-semibold text-ink">No se pudo cargar la información</p>
            <p className="mt-1 text-sm font-semibold text-muted">Revisa tu conexión e intenta de nuevo.</p>
            <button
              type="button"
              onClick={() => { setLoadFailed(false); void load(); }}
              className="mt-4 rounded-full bg-volt px-7 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            >
              Reintentar
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <DesktopAutoRedirect />
        <div className="pt-safe sticky top-[var(--matchday-offset,0px)] z-20 h-[68px] border-b border-slate-200/60 bg-white/88 dark:border-slate-800/60 dark:bg-slate-950/95 backdrop-blur-xl" />
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
  // Quien descansa se etiqueta "Descanso" y se manda al fondo en vez de mostrar
  // la venta de ayer.
  //
  // Quién descansa lo dice el archivo de HORARIOS, no la meta del RDV (ver
  // lib/working-today).
  const todayKey = data.dashboardDaily.date;
  const statusToday = scheduleStatusByUser(data.schedules, todayKey);
  const ranking = advisors
    .map((a) => {
      const kpi = data.kpis.find((k) => k.userId === a.id && k.date === todayKey);
      const status = statusToday.get(a.id);
      const resting = isRestingToday(status, kpi);
      return { advisor: a, kpi, resting, restText: restLabel(status, true) };
    })
    .sort((a, b) =>
      Number(a.resting) - Number(b.resting)
      || completion(b.kpi?.dailySales ?? 0, b.kpi?.dailyGoal ?? 0) - completion(a.kpi?.dailySales ?? 0, a.kpi?.dailyGoal ?? 0)
      || (b.kpi?.dailySales ?? 0) - (a.kpi?.dailySales ?? 0)
    );
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "Equipo";
  // KPI INDIVIDUAL del gerente (su columna en el RDV), separado del de tienda.
  // El gerente también vende y cobra comisión: aquí ve SU meta y SU venta.
  const myKpi = manager
    ? (data.kpis.find((k) => k.userId === manager.id && k.date !== undefined && k.date <= todayKey)
        ?? data.kpis.find((k) => k.userId === manager.id))
    : undefined;
  const myProgress = myKpi ? completion(myKpi.dailySales, myKpi.dailyGoal) : 0;
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
      detail: advisors.length === 0 ? "Toca para dar de alta" : "Asesores activos",
      icon: UsersRound,
      color: "purple",
      href: "/equipo"
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
        {data.announcements.filter((item) => !item.readBy.includes(manager?.id ?? "")).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-3d mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3.5"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EEF3FF] text-[#2563EB] dark:bg-[#172134] dark:text-[#6B9BFF]">
                <Megaphone size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">Comunicados pendientes</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Tienes {data.announcements.filter((item) => !item.readBy.includes(manager?.id ?? "")).length} {data.announcements.filter((item) => !item.readBy.includes(manager?.id ?? "")).length === 1 ? "comunicado" : "comunicados"} sin confirmar lectura.
                </p>
              </div>
            </div>
            <Link
              href="/comunicados"
              className="shrink-0 rounded-full bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white transition active:scale-95 dark:bg-[#6B9BFF]"
            >
              Leer
            </Link>
          </motion.div>
        )}

        <DailySalesCard
          sales={store?.dailySales ?? 0}
          goal={store?.dailyGoal ?? 0}
          label="Venta diaria tienda"
          delay={0.08}
        />

        <div className="mt-3">
          <QuickKpiGrid cards={kpiCards} delay={0.16} />
        </div>

        {manager && myKpi ? (
          <motion.div {...cardAnim(0.18)} className="mt-3">
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Trophy className="text-muted" size={18} />
                  <h2 className="text-[15px] font-semibold">Tu desempeño individual</h2>
                </div>
                <Badge tone="default">Gerencia</Badge>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-muted">Tu venta hoy</p>
                  <p className="mt-1 text-2xl font-semibold leading-none text-ink">{money(myKpi.dailySales)}</p>
                  <p className="mt-1 text-xs text-muted">Meta {money(myKpi.dailyGoal)}</p>
                </div>
                <span className={cn("text-[15px] font-semibold tabular-nums", performanceTextClass(myProgress))}>
                  {myProgress}%
                </span>
              </div>
              <div className="mt-2"><ProgressBar value={myProgress} /></div>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
                <Metric label="Meta mes" value={money(myKpi.monthlyGoal ?? 0)} />
                <Metric label="Venta mes" value={money(myKpi.monthlySales ?? 0)} />
                <Metric label="Comisión" value={money(myKpi.commissionAmount ?? 0)} />
              </div>
            </Card>
          </motion.div>
        ) : null}

        {manager ? (
          <motion.div {...cardAnim(0.2)} className="mt-3">
            <QuincenaCard userId={manager.id} />
          </motion.div>
        ) : null}

        <DesktopSwitchLink />

        {advisors.length === 0 ? (
          <motion.div {...cardAnim(0.2)} className="mt-3">
            <Link
              href="/equipo"
              className="flex items-center gap-3 rounded-[28px] border border-volt/30 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 transition active:scale-[0.98] dark:from-[#101c3a] dark:to-[#141233]"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-volt/15 text-volt"><UsersRound size={22} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Da de alta a tu equipo</p>
                <p className="text-xs font-semibold text-muted">Agrega a tus asesores y subgerentes para empezar.</p>
              </div>
              <ArrowRight size={18} className="shrink-0 text-volt" />
            </Link>
          </motion.div>
        ) : null}

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
          <UniformToday />
        </div>

        <motion.div {...cardAnim(0.40)} className="mt-3">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="text-muted" size={18} />
              <h2 className="text-[15px] font-semibold">Desempeño equipo</h2>
            </div>
            <p className="text-sm text-muted">
              {doneActivities} actividades completadas de {allActivities}.
            </p>
            <ProgressBar value={activityProgress} />
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.48)} className="mt-3">
          <Card className="p-0">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <h2 className="text-[13px] font-semibold text-ink/90">Ranking del día</h2>
              <span className="text-[11px] text-muted">Tienda</span>
            </div>
            <div>
              {(() => {
                let place = 0;
                return ranking.map(({ advisor, kpi, resting, restText }) => {
                  const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
                  if (!resting) place += 1;
                  const streak = computeDailyStreak(
                    data.kpis.filter((k) => k.userId === advisor.id && k.date !== undefined).map((k) => ({ date: k.date as string, sales: k.dailySales, goal: k.dailyGoal })),
                    todayKey
                  );
                  return (
                    <div key={advisor.id} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                      <span className={cn("w-5 shrink-0 text-center text-[13px] font-semibold tabular-nums", resting ? "text-muted/50" : "text-ink")}>
                        {resting ? "—" : place}
                      </span>
                      <ProfileAvatar name={advisor.name} photoUrl={advisor.photoUrl} size="sm" className={resting ? "opacity-50" : undefined} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ink">
                          {advisor.name}
                          {!resting && streak.current >= 2 ? <span className="ml-1.5 text-[11px] font-semibold text-orange-500">🔥{streak.current}</span> : null}
                        </p>
                        <p className="text-[11px] text-muted">
                          {resting ? restText : `${money(kpi?.dailySales ?? 0)} · meta ${money(kpi?.dailyGoal ?? 0)}`}
                        </p>
                      </div>
                      <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", resting ? "text-muted/50" : performanceTextClass(progress))}>
                        {resting ? "—" : `${progress}%`}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </Card>
        </motion.div>

        {celebrations.length > 0 ? (
          <motion.div {...cardAnim(0.54)} className="mt-3">
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Cake className="text-pink-500" size={18} />
                <h2 className="text-[15px] font-semibold">Próximos festejos</h2>
              </div>
              <div className="divide-y divide-white/[0.07]">
                {celebrations.map((celebration) => (
                  <div key={`${celebration.id}-${celebration.type}`} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="font-medium text-ink">{celebration.type === "cumple" ? "🎂" : "🎉"} {celebration.name}</p>
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
                <Megaphone className="text-muted" size={18} />
                <h2 className="text-[15px] font-semibold">Comunicados recientes</h2>
              </div>
              <Link href="/comunicados" className="text-xs font-semibold text-volt">Ver todos</Link>
            </div>
            {data.announcements.map((item) => (
              <div key={item.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <p className="font-medium text-ink">{item.title}</p>
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
              <h2 className="text-[15px] font-semibold">Pendientes de gerencia</h2>
              <Link href="/pendientes" className="text-xs font-semibold text-volt">Ver todos</Link>
            </div>
            <div className="divide-y divide-white/[0.07]">
              {critical.map((pending) => (
                <div key={pending.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink">{pending.title}</p>
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
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-void text-ink/65">
                <ClipboardCheck size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold tracking-[-0.02em] text-ink">Checklist de tienda</h2>
                <p className="mt-0.5 text-xs text-muted">Apertura y cierre con evidencia</p>
              </div>
              <Link
                href="/checklist"
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs font-semibold text-ink/75 transition active:scale-95"
              >
                Abrir <ArrowRight size={14} />
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div {...cardAnim(0.80)} className="mt-3">
          <Card className="p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-void text-ink/65">
                <Database size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold tracking-[-0.02em] text-ink">Centro de Datos</h2>
                <p className="mt-0.5 text-xs text-muted">Fuentes y sincronizaciones</p>
              </div>
              <Link
                href="/datos"
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs font-semibold text-ink/75 transition active:scale-95"
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
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-void text-ink/65">
                  <Building2 size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold tracking-[-0.02em] text-ink">Administración</h2>
                  <p className="mt-0.5 text-xs text-muted">Tiendas de la plataforma</p>
                </div>
                <Link
                  href="/admin"
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-xs font-semibold text-ink/75 transition active:scale-95"
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
