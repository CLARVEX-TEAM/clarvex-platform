"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { LogOut, RefreshCw, ShieldAlert, Store, Trophy, Users } from "lucide-react";
import { motion } from "framer-motion";
import { getSession, logout } from "@/lib/auth";
import { money } from "@/lib/format";
import type { User } from "@/lib/types";
import { AppCopyright, Badge, Card, ProfileAvatar, ProgressBar, ProgressRing } from "@/components/ui";
import { enContenedorNativo } from "@/lib/puente-nativo";
import { portadaDe } from "@/lib/portada";

interface StoreStat {
  id: string;
  name: string;
  salesToday: number;
  goalToday: number;
  salesMonth: number;
  goalMonth: number;
  advisorsCount: number;
}

interface TopAdvisor {
  name: string;
  photoUrl: string | null;
  storeName: string;
  sales: number;
}

interface RegionalData {
  date: string;
  stores: StoreStat[];
  topAdvisors: TopAdvisor[];
}

export default function RegionalDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<RegionalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) {
        router.replace("/login");
      } else if (session.role !== "REGIONAL") {
        router.replace(portadaDe(session, enContenedorNativo()));
      } else {
        setUser(session);
      }
    });
  }, [router]);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/regional/app-data");
      const payload = await res.json() as RegionalData & { error?: string };
      if (!res.ok) throw new Error(payload.error || "No se pudieron obtener los datos.");
      setData(payload);
    } catch (err: any) {
      setError(err.message || "Error al conectar con el servidor.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (user) {
      void loadData();
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!user || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-card text-ink">
        <div className="text-center space-y-4">
          <div className="animate-spin text-volt text-4xl">⏳</div>
          <p className="text-sm font-bold tracking-widest text-muted uppercase">Cargando Dashboard Regional...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-card text-ink p-8">
        <div className="text-center max-w-md">
          <ShieldAlert className="mx-auto text-orchid mb-4" size={48} />
          <h2 className="text-xl font-semibold">Error al cargar datos</h2>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button
            onClick={() => void loadData()}
            className="mt-6 rounded-full bg-volt px-6 py-2.5 text-xs font-semibold text-white tracking-widest uppercase hover:scale-105 active:scale-95 transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Cálculos consolidados de la región
  const totalSalesToday = data?.stores.reduce((sum, s) => sum + s.salesToday, 0) ?? 0;
  const totalGoalToday = data?.stores.reduce((sum, s) => sum + s.goalToday, 0) ?? 0;
  const regionalProgress = totalGoalToday > 0 ? Math.round((totalSalesToday / totalGoalToday) * 100) : 0;
  const totalActiveAdvisors = data?.stores.reduce((sum, s) => sum + s.advisorsCount, 0) ?? 0;
  const activeStoresCount = data?.stores.filter(s => s.salesToday > 0).length ?? 0;

  // Formato para gráfico de barras Recharts
  const chartData = data?.stores.map(s => ({
    name: s.name.replace("CLARVEX ", "").replace("TH ", ""),
    Ventas: s.salesToday,
    Meta: s.goalToday
  })) ?? [];

  return (
    <div className="min-h-screen bg-card text-ink">
      {/* Header Premium Adaptado a Escritorio */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-black/80 backdrop-blur-md py-3.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <ProfileAvatar name={user.name} photoUrl={user.photoUrl} size="md" className="ring-2 ring-[#2563EB]/30" />
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-ink">{user.name}</h1>
              <p className="text-[10px] font-bold text-volt uppercase tracking-wider">Director Regional</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="p-2.5 rounded-full bg-white/3 border border-white/8 hover:bg-white/8 transition"
              aria-label="Refrescar datos"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin text-volt" : "text-muted"} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-full bg-orchid/10 border border-orchid/30 text-orchid hover:bg-orchid/20 transition"
              aria-label="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Frame Principal con Responsive Grid */}
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto min-h-screen w-full max-w-md lg:max-w-7xl px-4 pb-24 pt-4 lg:pt-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda / Principal (Columna 1 y 2 en desktop) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* KPI Regional Consolidados */}
            <div className="premium-hero rounded-[28px] p-6 lg:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-volt">Desempeño Regional Hoy</p>
                  <h2 className="mt-1.5 text-[2.8rem] lg:text-[3.4rem] font-semibold leading-none tracking-tight text-ink">
                    {money(totalSalesToday)}
                  </h2>
                  <p className="mt-2 text-xs lg:text-sm font-semibold text-muted">
                    Meta regional: <span className="text-ink">{money(totalGoalToday)}</span>
                  </p>
                </div>
                <div className="flex justify-start sm:justify-end">
                  <ProgressRing value={regionalProgress} size={100} />
                </div>
              </div>
              
              <div className="mt-6 grid grid-cols-2 gap-4 pt-6 border-t border-white/8 text-xs">
                <div className="flex items-center gap-3">
                  <Store className="text-volt" size={18} />
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase">Tiendas Activas</p>
                    <p className="font-semibold text-ink mt-0.5 text-sm">{activeStoresCount} / {data?.stores.length}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="text-volt" size={18} />
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase">Colaboradores Hoy</p>
                    <p className="font-semibold text-ink mt-0.5 text-sm">{totalActiveAdvisors} activos</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico Comparativo */}
            <Card className="bg-black/40 border-white/8 p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Comparativa de Tiendas (Hoy)</h3>
                <Badge tone="success">Ventas vs Meta</Badge>
              </div>
              <div className="h-64 lg:h-80 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#64748b" tickLine={false} />
                    <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0A0A0A", borderColor: "rgba(255,255,255,0.08)", borderRadius: "16px" }}
                      labelStyle={{ fontWeight: "bold", color: "#fff" }}
                    />
                    <Bar dataKey="Ventas" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Meta" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Desglose por Tienda */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted px-1">Detalle por Sucursal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.stores.map(store => {
                  const storeProgress = store.goalToday > 0 ? Math.round((store.salesToday / store.goalToday) * 100) : 0;
                  return (
                    <Card key={store.id} className="bg-black/60 border-white/8 p-5 flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 place-items-center rounded-2xl bg-white/3 border border-white/8 text-volt">
                            <Store size={18} />
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-ink">{store.name}</h4>
                            <p className="text-[10px] text-muted font-bold mt-0.5">{store.advisorsCount} asesores trabajando</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-volt">{money(store.salesToday)}</span>
                          <p className="text-[10px] text-muted mt-0.5">Meta: {money(store.goalToday)}</p>
                        </div>
                      </div>

                      <div className="space-y-1.5 mt-auto">
                        <div className="flex justify-between text-[10px] font-bold text-muted">
                          <span>Progreso Diario</span>
                          <span className="text-ink">{storeProgress}%</span>
                        </div>
                        <ProgressBar value={storeProgress} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Columna Derecha / Lateral (Columna 3 en desktop) */}
          <div className="space-y-6">
            {/* Ranking de Asesores Regional */}
            <Card className="bg-black/40 border-white/8 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="text-volt" size={18} />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Top Asesores del Mes</h3>
              </div>
              
              <div className="divide-y divide-white/[0.07]">
                {data?.topAdvisors.map((advisor, index) => (
                  <div key={index} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold shrink-0 ${
                        index === 0 ? "bg-ember text-black" :
                        index === 1 ? "bg-line text-black" :
                        index === 2 ? "bg-ember text-white" :
                        "bg-white/5 text-muted border border-line"
                      }`}>
                        {index + 1}
                      </span>
                      <ProfileAvatar name={advisor.name} photoUrl={advisor.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ink truncate">{advisor.name}</p>
                        <p className="text-[10px] text-muted font-bold truncate mt-0.5">{advisor.storeName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-ink">{money(advisor.sales)}</span>
                      <p className="text-[9px] text-muted font-bold mt-0.5">acumulado</p>
                    </div>
                  </div>
                ))}
                
                {data?.topAdvisors.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted font-bold">No hay registros de ventas este mes.</p>
                )}
              </div>
            </Card>
          </div>
        </div>

        <AppCopyright />
      </motion.main>
    </div>
  );
}
