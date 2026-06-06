"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { BarChart3, Receipt, ShoppingBag, Target, TrendingUp } from "lucide-react";
import { fetchAppData, type AppData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { completion, money } from "@/lib/format";
import type { User } from "@/lib/types";
import { AppFrame, AppHeader, Badge, BottomNav, Card, ProgressBar, ProgressRing, StatCard } from "@/components/ui";

export default function KpisPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [session, setSession] = useState<User | null>(null);

  useEffect(() => {
    setSession(getSession());
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
  const dailyProgress = completion(activeKpi?.dailySales ?? 0, activeKpi?.dailyGoal ?? 0);
  const chartData = visibleAdvisors.map((advisor) => {
    const kpi = data.kpis.find((item) => item.userId === advisor.id);
    return {
      name: advisor.name,
      venta: kpi?.dailySales ?? 0,
      meta: kpi?.dailyGoal ?? 0
    };
  });

  return (
    <>
      <AppHeader title="KPIs" subtitle={isAdvisor ? "Tus indicadores personales." : "Venta, conversion, transacciones y ranking."} backHref={isAdvisor ? "/advisor" : "/manager"} />
      <AppFrame>
        <Card className="mb-5 border-volt/25 bg-volt/[0.045]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">Progreso de meta</p>
              <h2 className="mt-2 text-4xl font-black text-ink">{dailyProgress}%</h2>
              <p className="mt-1 text-sm text-muted">{money(activeKpi?.dailySales ?? 0)} de {money(activeKpi?.dailyGoal ?? 0)}</p>
            </div>
            <ProgressRing value={dailyProgress} />
          </div>
          <ProgressBar value={dailyProgress} />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Venta diaria" value={money(activeKpi?.dailySales ?? 0)} detail={isAdvisor ? "Personal" : "Tienda"} progress={dailyProgress} icon={<ShoppingBag size={17} />} />
          <StatCard label="Venta mensual" value={money(activeKpi?.monthlySales ?? 0)} detail={isAdvisor ? "Personal" : "Tienda"} tone="mint" progress={completion(activeKpi?.monthlySales ?? 0, activeKpi?.monthlyGoal ?? 0)} icon={<TrendingUp size={17} />} />
          <StatCard label="Ticket prom." value={money(activeKpi?.avgTicket ?? 0)} detail={isAdvisor ? "Personal" : "Promedio"} tone="ember" icon={<Receipt size={17} />} />
          <StatCard label="Conversion" value={`${activeKpi?.conversion ?? 0}%`} detail="Trafico a venta" tone="orchid" progress={activeKpi?.conversion ?? 0} icon={<Target size={17} />} />
        </div>

        <Card className="mt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-volt" size={18} />
              <h2 className="text-lg font-black">Venta vs meta</h2>
            </div>
            <Badge>compacto</Badge>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="kpiSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1E293B", borderRadius: 16, color: "#F8FAFC" }} />
                <Area type="monotone" dataKey="venta" stroke="#22C55E" strokeWidth={3} fill="url(#kpiSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="mt-5">
          <h2 className="mb-4 text-lg font-black">{isAdvisor ? "Mis KPIs" : "Ranking asesores"}</h2>
          <div className="space-y-3">
            {visibleAdvisors.map((advisor) => {
              const kpi = data.kpis.find((item) => item.userId === advisor.id);
              const progress = completion(kpi?.dailySales ?? 0, kpi?.dailyGoal ?? 0);
              return (
                <div key={advisor.id} className="liquid-glass rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-2xl bg-volt/12 text-sm font-black text-volt">{advisor.avatar}</span>
                      <div>
                        <h3 className="text-lg font-black">{advisor.name}</h3>
                        <p className="text-sm text-muted">{money(kpi?.dailySales ?? 0)} de {money(kpi?.dailyGoal ?? 0)}</p>
                      </div>
                    </div>
                    <Badge>#{kpi?.ranking ?? 0}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <Mini label="Ticket" value={money(kpi?.avgTicket ?? 0)} />
                    <Mini label="UPT" value={String(kpi?.upt ?? 0)} />
                    <Mini label="Trans." value={String(kpi?.transactions ?? 0)} />
                  </div>
                  <ProgressBar value={progress} />
                </div>
              );
            })}
          </div>
        </Card>
      </AppFrame>
      <BottomNav />
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.045] p-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-1 font-bold text-ink">{value}</p>
    </div>
  );
}
