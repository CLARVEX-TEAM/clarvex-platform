"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { BarChart3, Calculator, Percent, Receipt, ShoppingBag, Target, TrendingUp, Trophy, UsersRound } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { completion, money } from "@/lib/format";
import type { CommissionRule, Kpi, Role, User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProfileAvatar, ProgressBar, ProgressRing, StatCard } from "@/components/ui";

type Tab = "resumen" | "ventas" | "comision" | "ranking";

const tabs: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "ventas", label: "Ventas" },
  { id: "comision", label: "Comision" },
  { id: "ranking", label: "Ranking" }
];

export default function KpisPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [session, setSession] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [simulatedSales, setSimulatedSales] = useState("");

  useEffect(() => {
    getSession().then(setSession);
    fetchAppData().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <>
        <AppHeader title="KPIs" subtitle="Cargando indicadores desde PostgreSQL." backHref="/manager" />
        <AppFrame><Card>Conectando...</Card></AppFrame>
        <BottomNav />
      </>
    );
  }

  const advisors = data.users.filter((user) => user.role === "ASESOR");
  const store = data.kpis.find((item) => item.ranking === 0) ?? data.kpis[0];
  const isAdvisor = session?.role === "ASESOR";
  const visibleAdvisors = isAdvisor && session ? advisors.filter((advisor) => advisor.id === session.id) : advisors;
  const ownKpi = session ? data.kpis.find((item) => item.userId === session.id) : null;
  const activeKpi = (isAdvisor ? ownKpi : store) ?? store;
  const activeUser = data.users.find((user) => user.id === activeKpi?.userId) ?? session;
  const commissionRole = activeUser?.role ?? session?.role ?? "ASESOR";
  const dailyProgress = completion(activeKpi?.dailySales ?? 0, activeKpi?.dailyGoal ?? 0);
  const initialSimulation = simulatedSales ? Number(simulatedSales) : activeKpi?.dailySales ?? 0;
  const simulatedAchievement = getAchievement(initialSimulation, activeKpi?.dailyGoal ?? 0);
  const activeRule = findCommissionRule(data.commissionRules, commissionRole, simulatedAchievement);
  const appliedPercent = activeRule?.commissionPercent ?? activeKpi?.commissionPercent ?? 0;
  const simulatedCommission = initialSimulation * (appliedPercent / 100);
  const chartData = visibleAdvisors.map((advisor) => {
    const kpi = data.kpis.find((item) => item.userId === advisor.id);
    return {
      name: advisor.name,
      venta: kpi?.dailySales ?? 0,
      meta: kpi?.dailyGoal ?? 0,
      comision: kpi?.commissionAmount ?? 0
    };
  });

  const ranking = visibleAdvisors
    .map((advisor) => ({ advisor, kpi: data.kpis.find((item) => item.userId === advisor.id) }))
    .filter((item): item is { advisor: User; kpi: Kpi } => Boolean(item.kpi))
    .sort((a, b) => (a.kpi.ranking ?? 99) - (b.kpi.ranking ?? 99));

  return (
    <>
      <AppHeader title="KPIs" subtitle={isAdvisor ? "Tus indicadores personales." : "Venta, comision y ranking del equipo."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
      <div className="no-scrollbar tab-glass-shell -mx-1 mb-3 flex gap-1 overflow-x-auto overflow-y-hidden p-1 scroll-px-4">
          {tabs.map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              whileTap={{ scale: 0.96 }}
              className={`relative min-h-10 shrink-0 rounded-full px-3.5 text-[13px] font-black tracking-[-0.01em] transition ${activeTab === tab.id ? "text-white" : "text-muted hover:text-ink"}`}
            >
              {activeTab === tab.id ? (
                <motion.span
                  layoutId="kpi-tab-active"
                  className="absolute inset-0 rounded-full bg-volt shadow-[0_8px_18px_rgb(37_99_235_/_0.2)]"
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <span className="relative">{tab.label}</span>
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {activeTab === "resumen" ? (
              <ResumenView activeKpi={activeKpi} dailyProgress={dailyProgress} />
            ) : null}

            {activeTab === "ventas" ? (
              <VentasView activeKpi={activeKpi} chartData={chartData} dailyProgress={dailyProgress} />
            ) : null}

            {activeTab === "comision" ? (
              <ComisionView
                activeKpi={activeKpi}
                rules={data.commissionRules}
                simulatedSales={simulatedSales}
                setSimulatedSales={setSimulatedSales}
                activeRule={activeRule}
                appliedPercent={appliedPercent}
                simulatedCommission={simulatedCommission}
                simulatedAchievement={simulatedAchievement}
                commissionRole={commissionRole}
              />
            ) : null}

            {activeTab === "ranking" ? (
              <RankingView ranking={ranking} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </AppFrame>
      <BottomNav />
    </>
  );
}

function ResumenView({ activeKpi, dailyProgress }: { activeKpi: Kpi; dailyProgress: number }) {
  const aur = average(activeKpi.dailySales, activeKpi.pieces);
  const ept = average(activeKpi.pieces, activeKpi.transactions);

  return (
    <>
      <Card className="premium-hero mb-3 rounded-[28px] px-4 py-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Progreso de meta</p>
            <h2 className="mt-1 text-[2.25rem] font-black leading-none tracking-[-0.045em] text-ink">{dailyProgress}%</h2>
            <p className="mt-1 text-xs text-muted">{money(activeKpi.dailySales)} de {money(activeKpi.dailyGoal)}</p>
          </div>
          <ProgressRing value={dailyProgress} size={68} />
        </div>
        <ProgressBar value={dailyProgress} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard compact label="UPT" value={String(activeKpi.upt)} detail="Unidades por ticket" icon={<ShoppingBag size={15} />} />
        <StatCard compact label="AUR" value={money(aur)} detail="Precio promedio pieza" tone="sky" icon={<Receipt size={15} />} />
        <StatCard compact label="EPT" value={ept.toFixed(2)} detail="Piezas por transaccion" tone="purple" icon={<BarChart3 size={15} />} />
        <StatCard compact label="Conversion" value={`${activeKpi.conversion}%`} detail="Trafico a venta" tone="ember" progress={activeKpi.conversion} icon={<Target size={15} />} />
        <StatCard
          compact
          label="Margen DTO"
          value={hasPosDiscountData(activeKpi) ? `${activeKpi.discountMargin}%` : "Sin datos POS"}
          detail={hasPosDiscountData(activeKpi) ? "Descuento sobre venta bruta" : "Vincula Descuentos POS"}
          tone="orchid"
          icon={<Percent size={15} />}
        />
        <StatCard compact label="Comision" value={money(activeKpi.commissionAmount)} detail={`${activeKpi.commissionPercent}% estimado`} tone="volt" icon={<Trophy size={15} />} />
      </div>
    </>
  );
}

function hasPosDiscountData(kpi: Kpi) {
  return kpi.grossSales !== null && kpi.discountAmount !== null && kpi.discountMargin !== null;
}

function VentasView({ activeKpi, chartData, dailyProgress }: { activeKpi: Kpi; chartData: Array<{ name: string; venta: number; meta: number; comision: number }>; dailyProgress: number }) {
  return (
    <>
      <Card className="mb-3 rounded-[26px] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-volt" size={18} />
            <h2 className="text-lg font-black">Ventas</h2>
          </div>
          <Badge>{dailyProgress}%</Badge>
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="kpiSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, color: "#0F172A", boxShadow: "0 8px 20px rgb(15 23 42 / 0.1)" }} />
              <Area type="monotone" dataKey="venta" stroke="#2563EB" strokeWidth={3} fill="url(#kpiSales)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard compact label="Venta diaria" value={money(activeKpi.dailySales)} detail="Hoy" progress={dailyProgress} icon={<ShoppingBag size={15} />} />
        <StatCard compact label="Meta diaria" value={money(activeKpi.dailyGoal)} detail="Objetivo" tone="sky" progress={100} icon={<Target size={15} />} />
        <StatCard compact label="Venta mensual" value={money(activeKpi.monthlySales)} detail="Mes actual" tone="purple" progress={completion(activeKpi.monthlySales, activeKpi.monthlyGoal)} icon={<TrendingUp size={15} />} />
        <StatCard compact label="Transacciones" value={String(activeKpi.transactions)} detail="Tickets" tone="ember" icon={<Receipt size={15} />} />
      </div>
    </>
  );
}

function ComisionView({
  activeKpi,
  rules,
  simulatedSales,
  setSimulatedSales,
  activeRule,
  appliedPercent,
  simulatedCommission,
  simulatedAchievement,
  commissionRole
}: {
  activeKpi: Kpi;
  rules: CommissionRule[];
  simulatedSales: string;
  setSimulatedSales: (value: string) => void;
  activeRule?: CommissionRule;
  appliedPercent: number;
  simulatedCommission: number;
  simulatedAchievement: number;
  commissionRole: Role;
}) {
  const levelName = activeRule ? `${activeRule.minAchievement}% a ${activeRule.maxAchievement ?? "mas"}%` : "Sin regla";

  return (
    <>
      <Card className="premium-hero mb-3 rounded-[28px] p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.13em] text-muted">Comision estimada</p>
            <h2 className="mt-1 text-[2.1rem] font-black leading-none tracking-[-0.045em] text-ink">{money(simulatedCommission)}</h2>
            <p className="mt-1 text-sm text-muted">Nivel actual: {levelName}</p>
          </div>
          <div className="grid size-12 place-items-center rounded-[20px] border border-purple/30 bg-purple/15 text-purple shadow-[inset_0_1px_0_rgb(255_255_255_/_0.18)]">
            <Trophy size={26} />
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Mini label="Porcentaje" value={`${appliedPercent}%`} />
          <Mini label="Cumplimiento" value={`${Math.round(simulatedAchievement)}%`} />
        </div>
      </Card>

      <Card className="mb-3 rounded-[26px] p-3.5">
        <div className="mb-2.5 flex items-center gap-2">
          <Calculator className="text-volt" size={18} />
          <h2 className="text-lg font-black">Simulador de comision</h2>
        </div>
        <label className="text-xs font-black uppercase tracking-[0.14em] text-muted" htmlFor="simulationSales">Venta simulada</label>
        <input
          id="simulationSales"
          value={simulatedSales}
          onChange={(event) => setSimulatedSales(event.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          placeholder={String(activeKpi.dailySales)}
          className="mt-2 min-h-14 w-full rounded-[24px] border border-line bg-blue-50 px-4 text-xl font-black text-ink outline-none transition placeholder:text-muted/60 focus:border-volt focus:ring-4 focus:ring-volt/15"
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Mini label="Resultado" value={money(simulatedCommission)} />
          <Mini label="Aplicado" value={`${appliedPercent}%`} />
        </div>
      </Card>

      <Card className="rounded-[26px] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-lg font-black">Escalera de niveles</h2>
          <Badge>{commissionRole}</Badge>
        </div>
        <div className="divide-y divide-white/[0.07]">
          {rules.filter((rule) => !rule.role || rule.role === commissionRole).map((rule) => {
            const active = rule.id === activeRule?.id;
            return (
              <div key={rule.id} className={`py-2.5 ${active ? "text-volt" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{rule.minAchievement}% a {rule.maxAchievement ?? "mas"}%</p>
                    <p className="mt-1 text-sm text-muted">Regla por cumplimiento, no por venta</p>
                  </div>
                  <Badge tone={active ? "success" : "default"}>{rule.commissionPercent}%</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function RankingView({ ranking }: { ranking: Array<{ advisor: User; kpi: Kpi }> }) {
  const data = ranking.map(({ advisor, kpi }) => ({ name: advisor.name, venta: kpi.dailySales, comision: kpi.commissionAmount }));

  return (
    <>
      <Card className="mb-3 rounded-[26px] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersRound className="text-volt" size={18} />
            <h2 className="text-lg font-black">Ranking asesores</h2>
          </div>
          <Badge>equipo</Badge>
        </div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, color: "#0F172A", boxShadow: "0 8px 20px rgb(15 23 42 / 0.1)" }} />
              <Bar dataKey="venta" fill="#2563EB" radius={[10, 10, 10, 10]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="divide-y divide-white/[0.07] p-3.5">
        {ranking.map(({ advisor, kpi }) => {
          const progress = completion(kpi.dailySales, kpi.dailyGoal);
          return (
            <div key={advisor.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ProfileAvatar name={advisor.name} photoUrl={advisor.photoUrl} size="md" />
                  <div>
                    <h3 className="text-lg font-black">{advisor.name}</h3>
                    <p className="text-sm text-muted">#{kpi.ranking} ranking</p>
                  </div>
                </div>
                <Badge>{progress}%</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Mini label="Venta" value={money(kpi.dailySales)} />
                <Mini label="Comision" value={money(kpi.commissionAmount)} />
              </div>
              <ProgressBar value={progress} />
            </div>
          );
        })}
      </Card>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-white/[0.08] px-2 first:border-l-0">
      <p className="text-[11px] font-black uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-1 font-black text-ink">{value}</p>
    </div>
  );
}

function average(total: number, count: number) {
  if (!count) return 0;
  return total / count;
}

function getAchievement(sales: number, goal: number) {
  if (!goal) return 0;
  return (sales / goal) * 100;
}

function findCommissionRule(rules: CommissionRule[], role: Role, achievement: number) {
  console.log("[CLARVEX commission debug] input", { role, achievement });
  const roleRules = rules.filter((rule) => rule.active && (!rule.role || rule.role === role));
  console.log("[CLARVEX commission debug] roleRules", roleRules.map((rule) => ({
    id: rule.id,
    role: rule.role,
    minAchievement: rule.minAchievement,
    maxAchievement: rule.maxAchievement,
    commissionPercent: rule.commissionPercent
  })));

  const rule = roleRules.find((item) => {
    const minMatch = achievement >= item.minAchievement;
    const maxMatch = item.maxAchievement === null || item.maxAchievement === undefined || achievement <= item.maxAchievement;
    return minMatch && maxMatch;
  });

  console.log("[CLARVEX commission debug] selectedRule", rule ? {
    id: rule.id,
    role: rule.role,
    minAchievement: rule.minAchievement,
    maxAchievement: rule.maxAchievement,
    commissionPercent: rule.commissionPercent
  } : null);

  return rule;
}
